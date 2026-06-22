/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MovementType, Role } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { LOW_STOCK_EVENT } from './inventory.events';
import { INVENTORY_ADJUSTED } from '../audit/audit-actions';
import type { AccessTokenPayload } from '../auth/auth-tokens';

// $transaction(cb) runs the callback with a tx client proxying to the same
// mocks, so assertions can target prisma.inventoryItem.update etc.
const makePrisma = () => {
  const prisma: any = {
    inventoryItem: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    inventoryMovement: { create: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $queryRaw: jest.fn(),
  };
  prisma.$transaction = jest.fn(async (cb: (tx: any) => Promise<unknown>) =>
    cb(prisma),
  );
  return prisma;
};

const makeEvents = () => ({ emit: jest.fn() });
const makeAudit = () => ({ record: jest.fn().mockResolvedValue(undefined) });

/** A canonical actor for adjust tests. */
const actor: AccessTokenPayload = { sub: 'admin1', email: 'a@b.c', role: Role.ADMIN };

const build = () => {
  const prisma = makePrisma();
  const events = makeEvents();
  const audit = makeAudit();
  const svc = new InventoryService(prisma as never, events as never, audit as never);
  return { svc, prisma, events, audit };
};

/** A stored inventory row for `productId` (default p1). */
const item = (over: Record<string, unknown> = {}) => ({
  id: 'inv1',
  productId: 'p1',
  available: 10,
  reserved: 0,
  lowStockThreshold: 5,
  ...over,
});

describe('InventoryService.reserve', () => {
  it('moves stock available→reserved and appends a RESERVATION movement atomically', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(item());
    prisma.inventoryItem.update.mockResolvedValue(
      item({ available: 7, reserved: 3 }),
    );

    await svc.reserve('p1', 3, 'order1');

    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'inv1' },
      data: { available: { decrement: 3 }, reserved: { increment: 3 } },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        inventoryItemId: 'inv1',
        type: MovementType.RESERVATION,
        quantity: -3,
        orderId: 'order1',
        reason: null,
      },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('rejects reserving more than available with 400 and writes nothing', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(item({ available: 2 }));

    await expect(svc.reserve('p1', 3, 'order1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('throws 404 when the product has no inventory item', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(null);

    await expect(svc.reserve('ghost', 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });
});

describe('InventoryService.release', () => {
  it('moves stock reserved→available and appends a RELEASE movement', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(
      item({ available: 7, reserved: 3 }),
    );
    prisma.inventoryItem.update.mockResolvedValue(
      item({ available: 9, reserved: 1 }),
    );

    await svc.release('p1', 2, 'order1');

    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'inv1' },
      data: { available: { increment: 2 }, reserved: { decrement: 2 } },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        inventoryItemId: 'inv1',
        type: MovementType.RELEASE,
        quantity: 2,
        orderId: 'order1',
        reason: null,
      },
    });
  });

  it('rejects releasing more than reserved with 400', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(item({ reserved: 1 }));

    await expect(svc.release('p1', 2)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });
});

describe('transaction passthrough', () => {
  // A caller-supplied tx client: the op must use THIS for reads/writes and must
  // NOT open its own nested $transaction (it joins the caller's transaction).
  const makeTx = () => ({
    inventoryItem: { findUnique: jest.fn(), update: jest.fn() },
    inventoryMovement: { create: jest.fn() },
  });

  it('reserve uses the passed tx and opens no nested transaction', async () => {
    const { svc, prisma } = build();
    const tx: any = makeTx();
    tx.inventoryItem.findUnique.mockResolvedValue(item());

    await svc.reserve('p1', 2, 'order1', tx);

    expect(tx.inventoryItem.findUnique).toHaveBeenCalledWith({
      where: { productId: 'p1' },
    });
    expect(tx.inventoryItem.update).toHaveBeenCalled();
    expect(tx.inventoryMovement.create).toHaveBeenCalled();
    // joined the caller's tx — no own transaction, no client-level writes
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('release uses the passed tx and opens no nested transaction', async () => {
    const { svc, prisma } = build();
    const tx: any = makeTx();
    tx.inventoryItem.findUnique.mockResolvedValue(item({ reserved: 3 }));

    await svc.release('p1', 1, 'order1', tx);

    expect(tx.inventoryItem.update).toHaveBeenCalled();
    expect(tx.inventoryMovement.create).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('InventoryService.deduct', () => {
  it('reduces reserved on fulfillment and appends a DEDUCTION movement', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(
      item({ available: 7, reserved: 3 }),
    );
    prisma.inventoryItem.update.mockResolvedValue(
      item({ available: 7, reserved: 1 }),
    );

    await svc.deduct('p1', 2, 'order1');

    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'inv1' },
      data: { reserved: { decrement: 2 } },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        inventoryItemId: 'inv1',
        type: MovementType.DEDUCTION,
        quantity: -2,
        orderId: 'order1',
        reason: null,
      },
    });
  });

  it('rejects deducting more than reserved with 400', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(item({ reserved: 1 }));

    await expect(svc.deduct('p1', 2)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });
});

describe('InventoryService.restock', () => {
  it('returns goods to available and appends an ADDITION movement (reason refund)', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(item({ available: 7 }));
    prisma.inventoryItem.update.mockResolvedValue(item({ available: 9 }));

    await svc.restock('p1', 2, 'order1');

    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'inv1' },
      data: { available: { increment: 2 } },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        inventoryItemId: 'inv1',
        type: MovementType.ADDITION,
        quantity: 2,
        orderId: 'order1',
        reason: 'refund',
      },
    });
  });

  it('uses the passed tx and opens no nested transaction', async () => {
    const { svc, prisma } = build();
    const tx: any = {
      inventoryItem: { findUnique: jest.fn(), update: jest.fn() },
      inventoryMovement: { create: jest.fn() },
    };
    tx.inventoryItem.findUnique.mockResolvedValue(item({ available: 7 }));

    await svc.restock('p1', 2, 'order1', tx);

    expect(tx.inventoryItem.update).toHaveBeenCalled();
    expect(tx.inventoryMovement.create).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws 404 when the product has no inventory item', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(null);

    await expect(svc.restock('ghost', 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });
});

describe('InventoryService.adjust', () => {
  it('ADDITION increases available and appends an ADDITION movement', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(item({ available: 10 }));
    prisma.inventoryItem.update.mockResolvedValue(item({ available: 13 }));

    await svc.adjust(actor, 'p1', {
      type: MovementType.ADDITION,
      quantity: 3,
      reason: 'restock',
    });

    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'inv1' },
      data: { available: { increment: 3 } },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        inventoryItemId: 'inv1',
        type: MovementType.ADDITION,
        quantity: 3,
        orderId: null,
        reason: 'restock',
      },
    });
  });

  it('DEDUCTION decreases available and appends a DEDUCTION movement', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(item({ available: 10 }));
    prisma.inventoryItem.update.mockResolvedValue(item({ available: 8 }));

    await svc.adjust(actor, 'p1', {
      type: MovementType.DEDUCTION,
      quantity: 2,
      reason: 'damaged',
    });

    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'inv1' },
      data: { available: { decrement: 2 } },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        inventoryItemId: 'inv1',
        type: MovementType.DEDUCTION,
        quantity: -2,
        orderId: null,
        reason: 'damaged',
      },
    });
  });

  it('rejects a DEDUCTION that exceeds available with 400', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(item({ available: 1 }));

    await expect(
      svc.adjust(actor, 'p1', {
        type: MovementType.DEDUCTION,
        quantity: 2,
        reason: 'damaged',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('ADJUSTMENT sets available to the absolute count with a signed-diff movement', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(item({ available: 10 }));
    prisma.inventoryItem.update.mockResolvedValue(item({ available: 7 }));

    // recount: actual on-hand is 7 (down from 10) -> delta -3
    await svc.adjust(actor, 'p1', {
      type: MovementType.ADJUSTMENT,
      quantity: 7,
      reason: 'cycle count',
    });

    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'inv1' },
      data: { available: { set: 7 } },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        inventoryItemId: 'inv1',
        type: MovementType.ADJUSTMENT,
        quantity: -3,
        orderId: null,
        reason: 'cycle count',
      },
    });
  });

  it('allows an ADJUSTMENT recount to zero', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(item({ available: 4 }));
    prisma.inventoryItem.update.mockResolvedValue(item({ available: 0 }));

    await svc.adjust(actor, 'p1', {
      type: MovementType.ADJUSTMENT,
      quantity: 0,
      reason: 'none on hand',
    });

    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'inv1' },
      data: { available: { set: 0 } },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        inventoryItemId: 'inv1',
        type: MovementType.ADJUSTMENT,
        quantity: -4,
        orderId: null,
        reason: 'none on hand',
      },
    });
  });

  it('rejects a zero-quantity ADDITION as a no-op', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(item());

    await expect(
      svc.adjust(actor, 'p1', {
        type: MovementType.ADDITION,
        quantity: 0,
        reason: 'noop',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('rejects an order-driven movement type (RESERVATION/RELEASE) via adjust', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(item());

    await expect(
      // Cast: the type system already forbids this (adjust takes
      // ManualMovementType); this guards the runtime path defensively.
      svc.adjust(actor, 'p1', {
        type: MovementType.RESERVATION as never,
        quantity: 1,
        reason: 'nope',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('throws 404 when the product has no inventory item', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(null);

    await expect(
      svc.adjust(actor, 'ghost', {
        type: MovementType.ADDITION,
        quantity: 1,
        reason: 'x',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ADDITION records an INVENTORY_ADJUSTED audit row atomically with the movement', async () => {
    const { svc, prisma, audit } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(item({ available: 10 }));
    prisma.inventoryItem.update.mockResolvedValue(item({ available: 15 }));

    await svc.adjust(actor, 'p1', {
      type: MovementType.ADDITION,
      quantity: 5,
      reason: 'new shipment',
    });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin1',
        action: INVENTORY_ADJUSTED,
        entityType: 'InventoryItem',
        entityId: 'p1',
        metadata: { type: MovementType.ADDITION, delta: 5, reason: 'new shipment' },
      }),
      expect.anything(), // tx client
    );
    // Movement and audit share the same transaction
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('ADJUSTMENT records an INVENTORY_ADJUSTED audit row with signed delta', async () => {
    const { svc, prisma, audit } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(item({ available: 10 }));
    prisma.inventoryItem.update.mockResolvedValue(item({ available: 4 }));

    await svc.adjust(actor, 'p1', {
      type: MovementType.ADJUSTMENT,
      quantity: 4,
      reason: 'cycle count',
    });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin1',
        action: INVENTORY_ADJUSTED,
        entityType: 'InventoryItem',
        entityId: 'p1',
        metadata: { type: MovementType.ADJUSTMENT, delta: -6, reason: 'cycle count' },
      }),
      expect.anything(),
    );
  });
});

describe('InventoryService low-stock alerts', () => {
  // threshold 5 throughout (default item()).
  it('emits low-stock when a reservation takes available across the threshold', async () => {
    const { svc, prisma, events } = build();
    // 6 available (above 5) -> reserve 2 -> 4 available (at/below 5): crossing
    prisma.inventoryItem.findUnique.mockResolvedValue(
      item({ available: 6, reserved: 0 }),
    );
    prisma.inventoryItem.update.mockResolvedValue(
      item({ available: 4, reserved: 2 }),
    );

    await svc.reserve('p1', 2, 'order1');

    expect(events.emit).toHaveBeenCalledWith(LOW_STOCK_EVENT, {
      productId: 'p1',
      available: 4,
      threshold: 5,
    });
  });

  it('does not emit when available stays above the threshold', async () => {
    const { svc, prisma, events } = build();
    // 10 -> reserve 2 -> 8, still above 5
    prisma.inventoryItem.findUnique.mockResolvedValue(item({ available: 10 }));
    prisma.inventoryItem.update.mockResolvedValue(item({ available: 8 }));

    await svc.reserve('p1', 2, 'order1');

    expect(events.emit).not.toHaveBeenCalled();
  });

  it('does not emit again when already at/below the threshold (no re-cross)', async () => {
    const { svc, prisma, events } = build();
    // already 4 (<=5) -> reserve 1 -> 3: no downward CROSSING (was already low)
    prisma.inventoryItem.findUnique.mockResolvedValue(item({ available: 4 }));
    prisma.inventoryItem.update.mockResolvedValue(item({ available: 3 }));

    await svc.reserve('p1', 1, 'order1');

    expect(events.emit).not.toHaveBeenCalled();
  });

  it('emits when a manual DEDUCTION crosses the threshold', async () => {
    const { svc, prisma, events } = build();
    // 6 -> deduct 3 -> 3 (crosses 5)
    prisma.inventoryItem.findUnique.mockResolvedValue(item({ available: 6 }));
    prisma.inventoryItem.update.mockResolvedValue(item({ available: 3 }));

    await svc.adjust(actor, 'p1', {
      type: MovementType.DEDUCTION,
      quantity: 3,
      reason: 'damaged',
    });

    expect(events.emit).toHaveBeenCalledWith(LOW_STOCK_EVENT, {
      productId: 'p1',
      available: 3,
      threshold: 5,
    });
  });

  it('emits when an ADJUSTMENT recount sets available below the threshold', async () => {
    const { svc, prisma, events } = build();
    // 10 -> adjust set 2 (below 5)
    prisma.inventoryItem.findUnique.mockResolvedValue(item({ available: 10 }));
    prisma.inventoryItem.update.mockResolvedValue(item({ available: 2 }));

    await svc.adjust(actor, 'p1', {
      type: MovementType.ADJUSTMENT,
      quantity: 2,
      reason: 'cycle count',
    });

    expect(events.emit).toHaveBeenCalledWith(LOW_STOCK_EVENT, {
      productId: 'p1',
      available: 2,
      threshold: 5,
    });
  });

  it('never emits on an ADDITION (available only rises)', async () => {
    const { svc, prisma, events } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(item({ available: 2 }));
    prisma.inventoryItem.update.mockResolvedValue(item({ available: 7 }));

    await svc.adjust(actor, 'p1', {
      type: MovementType.ADDITION,
      quantity: 5,
      reason: 'restock',
    });

    expect(events.emit).not.toHaveBeenCalled();
  });
});

describe('InventoryService.listStock', () => {
  /** An inventory row joined with its product, as findMany returns it. */
  const stockRow = (over: Record<string, unknown> = {}) => ({
    productId: 'p1',
    available: 8,
    reserved: 2,
    lowStockThreshold: 5,
    product: { name: 'Mouse', sku: 'MSE-1' },
    ...over,
  });

  it('returns a paginated stock list with product info and a computed isLowStock flag', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findMany.mockResolvedValue([
      stockRow(),
      stockRow({
        productId: 'p2',
        available: 3,
        lowStockThreshold: 5,
        product: { name: 'Keyboard', sku: 'KBD-1' },
      }),
    ]);
    prisma.inventoryItem.count.mockResolvedValue(2);

    const res = await svc.listStock({});

    expect(res.data).toEqual([
      {
        productId: 'p1',
        name: 'Mouse',
        sku: 'MSE-1',
        available: 8,
        reserved: 2,
        lowStockThreshold: 5,
        isLowStock: false, // 8 > 5
      },
      {
        productId: 'p2',
        name: 'Keyboard',
        sku: 'KBD-1',
        available: 3,
        reserved: 2,
        lowStockThreshold: 5,
        isLowStock: true, // 3 <= 5
      },
    ]);
    expect(res.total).toBe(2);
    // unfiltered: no raw column-compare query
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('filters to low-stock rows when lowStock=true (column compare via raw)', async () => {
    const { svc, prisma } = build();
    // raw query resolves the productIds whose available <= lowStockThreshold
    prisma.$queryRaw.mockResolvedValue([{ productId: 'p2' }]);
    prisma.inventoryItem.findMany.mockResolvedValue([
      stockRow({
        productId: 'p2',
        available: 3,
        lowStockThreshold: 5,
        product: { name: 'Keyboard', sku: 'KBD-1' },
      }),
    ]);
    prisma.inventoryItem.count.mockResolvedValue(1);

    const res = await svc.listStock({ lowStock: true });

    expect(prisma.$queryRaw).toHaveBeenCalled();
    // the findMany is constrained to the low-stock productIds
    expect(prisma.inventoryItem.findMany.mock.calls[0][0].where).toEqual({
      productId: { in: ['p2'] },
    });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].isLowStock).toBe(true);
    expect(res.total).toBe(1);
  });
});

describe('InventoryService.getStockItem', () => {
  it('returns the item state plus recent movements (newest-first)', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue({
      id: 'inv1',
      productId: 'p1',
      available: 8,
      reserved: 2,
      lowStockThreshold: 5,
      product: { name: 'Mouse', sku: 'MSE-1' },
      movements: [
        {
          type: MovementType.RESERVATION,
          quantity: -2,
          reason: null,
          orderId: 'o1',
          createdAt: new Date('2026-06-18T10:00:00Z'),
        },
      ],
    });

    const res = await svc.getStockItem('p1');

    expect(res.productId).toBe('p1');
    expect(res.name).toBe('Mouse');
    expect(res.available).toBe(8);
    expect(res.reserved).toBe(2);
    expect(res.isLowStock).toBe(false);
    expect(res.movements).toEqual([
      {
        type: MovementType.RESERVATION,
        quantity: -2,
        reason: null,
        orderId: 'o1',
        createdAt: new Date('2026-06-18T10:00:00Z'),
      },
    ]);
  });

  it('throws 404 when the product has no inventory item', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(null);
    await expect(svc.getStockItem('ghost')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
