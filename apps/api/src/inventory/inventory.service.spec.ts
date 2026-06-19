/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MovementType } from '@prisma/client';
import { InventoryService } from './inventory.service';

// $transaction(cb) runs the callback with a tx client proxying to the same
// mocks, so assertions can target prisma.inventoryItem.update etc.
const makePrisma = () => {
  const prisma: any = {
    inventoryItem: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    inventoryMovement: { create: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (cb: (tx: any) => Promise<unknown>) =>
    cb(prisma),
  );
  return prisma;
};

const build = () => {
  const prisma = makePrisma();
  const svc = new InventoryService(prisma as never);
  return { svc, prisma };
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

describe('InventoryService.adjust', () => {
  it('ADDITION increases available and appends an ADDITION movement', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findUnique.mockResolvedValue(item({ available: 10 }));
    prisma.inventoryItem.update.mockResolvedValue(item({ available: 13 }));

    await svc.adjust('p1', {
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

    await svc.adjust('p1', {
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
      svc.adjust('p1', {
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
    await svc.adjust('p1', {
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

    await svc.adjust('p1', {
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
      svc.adjust('p1', {
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
      svc.adjust('p1', {
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
      svc.adjust('ghost', {
        type: MovementType.ADDITION,
        quantity: 1,
        reason: 'x',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
