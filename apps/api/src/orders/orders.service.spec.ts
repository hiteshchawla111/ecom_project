/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, ProductStatus, Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CheckoutDto } from './dto/checkout.dto';
import type { AccessTokenPayload } from '../auth/auth-tokens';

const makeConfig = () => ({
  get: (key: string) =>
    ({
      TAX_RATE: '0.1',
      SHIPPING_FLAT: '5.00',
      FREE_SHIPPING_THRESHOLD: '50.00',
    })[key],
});

// $transaction(cb) executes the callback with a tx client that proxies to the
// same mock methods, so assertions can target prisma.order.create etc.
const makePrisma = () => {
  const prisma: any = {
    cart: { findFirst: jest.fn() },
    order: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    cartItem: { deleteMany: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (cb: (tx: any) => Promise<unknown>) =>
    cb(prisma),
  );
  return prisma;
};

const makeInventory = () => ({
  reserve: jest.fn().mockResolvedValue(null),
  release: jest.fn().mockResolvedValue(undefined),
  deduct: jest.fn().mockResolvedValue(undefined),
  restock: jest.fn().mockResolvedValue(undefined),
  emitLowStock: jest.fn(),
});

const build = () => {
  const prisma = makePrisma();
  const inventory = makeInventory();
  const svc = new OrdersService(
    prisma as never,
    makeConfig() as never,
    inventory as never,
  );
  return { svc, prisma, inventory };
};

const shipping: CheckoutDto = {
  shipFullName: 'Ada Lovelace',
  shipLine1: '12 Analytical Way',
  shipCity: 'London',
  shipState: 'Greater London',
  shipCountry: 'UK',
  shipPostalCode: 'EC1A 1BB',
};

const cartWith = (items: unknown[]) => ({ id: 'cart1', items });
const activeLine = (over: Record<string, unknown> = {}) => ({
  productId: 'p1',
  quantity: 2,
  product: {
    name: 'Mouse',
    price: '19.99',
    salePrice: null,
    status: ProductStatus.ACTIVE,
    deletedAt: null,
  },
  ...over,
});

/**
 * What order.create resolves to.  Money fields intentionally use integer-like
 * strings (e.g. '16', '5') that Prisma.Decimal.toString() would return without
 * trailing zeros — the money() helper must normalise them to 2-dp strings.
 */
const createdOrder = {
  id: 'order1',
  status: OrderStatus.PENDING,
  subtotal: '10',
  discountTotal: '0',
  taxTotal: '1',
  shippingTotal: '5',
  grandTotal: '16',
  ...shipping,
  shipLine2: null,
  items: [
    {
      productId: 'p1',
      productName: 'Mouse',
      unitPrice: '5',
      quantity: 2,
      lineTotal: '10',
    },
  ],
  createdAt: new Date('2026-06-17T12:00:00Z'),
};

describe('OrdersService.placeOrder', () => {
  it('creates a PENDING order with snapshotted totals + items and clears the cart', async () => {
    const { svc, prisma, inventory } = build();
    prisma.cart.findFirst.mockResolvedValue(cartWith([activeLine()]));
    prisma.order.create.mockResolvedValue(createdOrder);

    const view = await svc.placeOrder('u1', shipping);

    // reserves each line's stock within the placement transaction (tx passed)
    expect(inventory.reserve).toHaveBeenCalledWith('p1', 2, 'order1', prisma);

    // order.create called with PENDING status + computed totals + nested items
    const createArg = prisma.order.create.mock.calls[0][0];
    expect(createArg.data.status).toBe(OrderStatus.PENDING);
    expect(createArg.data.userId).toBe('u1');
    expect(createArg.data.subtotal).toBe('39.98');
    expect(createArg.data.grandTotal).toBe('48.98');
    expect(createArg.data.shipFullName).toBe('Ada Lovelace');
    expect(createArg.data.items.create).toEqual([
      {
        productId: 'p1',
        productName: 'Mouse',
        unitPrice: '19.99',
        quantity: 2,
        lineTotal: '39.98',
      },
    ]);
    // cart cleared
    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: 'cart1' },
    });
    // wrapped in a transaction
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(view.id).toBe('order1');
    expect(view.status).toBe(OrderStatus.PENDING);
    // money fields must be 2-dp strings regardless of what Prisma Decimal returns
    expect(view.subtotal).toBe('10.00');
    expect(view.discountTotal).toBe('0.00');
    expect(view.taxTotal).toBe('1.00');
    expect(view.shippingTotal).toBe('5.00');
    expect(view.grandTotal).toBe('16.00');
    expect(view.items[0].unitPrice).toBe('5.00');
    expect(view.items[0].lineTotal).toBe('10.00');
  });

  it('rejects an empty cart with 400 and creates no order', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(cartWith([]));
    await expect(svc.placeOrder('u1', shipping)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects when the user has no cart at all with 400', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(null);
    await expect(svc.placeOrder('u1', shipping)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('emits a deferred low-stock alert after placement commits', async () => {
    const { svc, prisma, inventory } = build();
    prisma.cart.findFirst.mockResolvedValue(cartWith([activeLine()]));
    prisma.order.create.mockResolvedValue(createdOrder);
    const crossing = { productId: 'p1', available: 2, threshold: 5 };
    inventory.reserve.mockResolvedValue(crossing);

    await svc.placeOrder('u1', shipping);

    // emitted post-commit (the reserve ran inside the placement tx)
    expect(inventory.emitLowStock).toHaveBeenCalledWith(crossing);
  });

  it('does not complete placement if reserving stock fails (rolls back)', async () => {
    const { svc, prisma, inventory } = build();
    prisma.cart.findFirst.mockResolvedValue(cartWith([activeLine()]));
    prisma.order.create.mockResolvedValue(createdOrder);
    // e.g. insufficient stock or no inventory item -> reserve throws
    inventory.reserve.mockRejectedValue(
      new BadRequestException('Insufficient stock available to reserve'),
    );

    await expect(svc.placeOrder('u1', shipping)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // cart must NOT be cleared when the transaction fails
    expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects a non-ACTIVE line with 400 and creates no order', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(
      cartWith([
        activeLine({
          product: {
            name: 'Gone',
            price: '5.00',
            salePrice: null,
            status: ProductStatus.ARCHIVED,
            deletedAt: null,
          },
        }),
      ]),
    );
    await expect(svc.placeOrder('u1', shipping)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
  });
});

describe('OrdersService.getOrder', () => {
  it("returns the caller's own order", async () => {
    const { svc, prisma } = build();
    prisma.order.findFirst.mockResolvedValue(createdOrder);

    const view = await svc.getOrder('u1', 'order1');

    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: 'order1', userId: 'u1' },
      include: { items: true },
    });
    expect(view.id).toBe('order1');
    // money fields must be 2-dp strings
    expect(view.grandTotal).toBe('16.00');
    expect(view.items[0].unitPrice).toBe('5.00');
    expect(view.items[0].lineTotal).toBe('10.00');
  });

  it('throws 404 for an unknown or non-owned order', async () => {
    const { svc, prisma } = build();
    prisma.order.findFirst.mockResolvedValue(null);
    await expect(svc.getOrder('u1', 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('OrdersService.listOrders', () => {
  it('returns a paginated, newest-first summary scoped to the user', async () => {
    const { svc, prisma } = build();
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'o2',
        status: OrderStatus.PENDING,
        grandTotal: '16', // integer-like string — must become '16.00'
        createdAt: new Date('2026-06-17T12:00:00Z'),
        _count: { items: 2 },
      },
    ]);
    prisma.order.count.mockResolvedValue(1);

    const res = await svc.listOrders('u1', {});

    const findArg = prisma.order.findMany.mock.calls[0][0];
    expect(findArg.where).toEqual({ userId: 'u1' });
    expect(findArg.orderBy).toEqual({ createdAt: 'desc' });
    expect(prisma.order.count).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
    expect(res).toEqual({
      data: [
        {
          id: 'o2',
          status: OrderStatus.PENDING,
          grandTotal: '16.00', // 2-dp normalised
          itemCount: 2,
          createdAt: new Date('2026-06-17T12:00:00Z'),
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });
});

describe('OrdersService.updateStatus', () => {
  const admin: AccessTokenPayload = {
    sub: 'admin1',
    email: 'admin@shop.test',
    role: Role.ADMIN,
  };
  const customer: AccessTokenPayload = {
    sub: 'u1',
    email: 'cust@shop.test',
    role: Role.CUSTOMER,
  };

  /** A stored order row at a given status, owned by `userId` (default u1). */
  const orderAt = (status: OrderStatus, userId = 'u1') => ({
    ...createdOrder,
    status,
    userId,
  });

  it('lets an ADMIN make a valid transition and returns the updated view', async () => {
    const { svc, prisma, inventory } = build();
    prisma.order.findUnique.mockResolvedValue(orderAt(OrderStatus.PENDING));
    prisma.order.update.mockResolvedValue(orderAt(OrderStatus.CONFIRMED));

    const view = await svc.updateStatus(admin, 'order1', OrderStatus.CONFIRMED);

    const updateArg = prisma.order.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'order1' });
    expect(updateArg.data).toEqual({ status: OrderStatus.CONFIRMED });
    expect(view.status).toBe(OrderStatus.CONFIRMED);
    // a non-cancel/non-ship transition moves no stock
    expect(inventory.release).not.toHaveBeenCalled();
    expect(inventory.deduct).not.toHaveBeenCalled();
  });

  it('deducts each line’s reserved stock when an order is SHIPPED', async () => {
    const { svc, prisma, inventory } = build();
    prisma.order.findUnique.mockResolvedValue(orderAt(OrderStatus.PROCESSING));
    prisma.order.update.mockResolvedValue(orderAt(OrderStatus.SHIPPED));

    const view = await svc.updateStatus(admin, 'order1', OrderStatus.SHIPPED);

    expect(inventory.deduct).toHaveBeenCalledWith('p1', 2, 'order1', prisma);
    expect(inventory.release).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(view.status).toBe(OrderStatus.SHIPPED);
  });

  it('does not deduct on SHIPPED→DELIVERED', async () => {
    const { svc, prisma, inventory } = build();
    prisma.order.findUnique.mockResolvedValue(orderAt(OrderStatus.SHIPPED));
    prisma.order.update.mockResolvedValue(orderAt(OrderStatus.DELIVERED));

    await svc.updateStatus(admin, 'order1', OrderStatus.DELIVERED);

    expect(inventory.deduct).not.toHaveBeenCalled();
    expect(inventory.restock).not.toHaveBeenCalled();
  });

  it('restocks each line’s goods when an order is REFUNDED', async () => {
    const { svc, prisma, inventory } = build();
    prisma.order.findUnique.mockResolvedValue(orderAt(OrderStatus.DELIVERED));
    prisma.order.update.mockResolvedValue(orderAt(OrderStatus.REFUNDED));

    const view = await svc.updateStatus(admin, 'order1', OrderStatus.REFUNDED);

    expect(inventory.restock).toHaveBeenCalledWith('p1', 2, 'order1', prisma);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(view.status).toBe(OrderStatus.REFUNDED);
  });

  it('releases each line’s reserved stock when an order is CANCELLED', async () => {
    const { svc, prisma, inventory } = build();
    prisma.order.findUnique.mockResolvedValue(orderAt(OrderStatus.PENDING));
    prisma.order.update.mockResolvedValue(orderAt(OrderStatus.CANCELLED));

    await svc.updateStatus(admin, 'order1', OrderStatus.CANCELLED);

    // releases the reserved qty for each order line within the same tx (prisma)
    expect(inventory.release).toHaveBeenCalledWith('p1', 2, 'order1', prisma);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('rejects an ADMIN invalid transition with 409 and writes nothing', async () => {
    const { svc, prisma } = build();
    prisma.order.findUnique.mockResolvedValue(orderAt(OrderStatus.PENDING));

    await expect(
      svc.updateStatus(admin, 'order1', OrderStatus.SHIPPED),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('throws 404 for an unknown order', async () => {
    const { svc, prisma } = build();
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(
      svc.updateStatus(admin, 'nope', OrderStatus.CONFIRMED),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('lets a CUSTOMER cancel their own PENDING order', async () => {
    const { svc, prisma } = build();
    prisma.order.findUnique.mockResolvedValue(orderAt(OrderStatus.PENDING));
    prisma.order.update.mockResolvedValue(orderAt(OrderStatus.CANCELLED));

    const view = await svc.updateStatus(
      customer,
      'order1',
      OrderStatus.CANCELLED,
    );

    expect(view.status).toBe(OrderStatus.CANCELLED);
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order1' },
      data: { status: OrderStatus.CANCELLED },
      include: { items: true },
    });
  });

  it('forbids a CUSTOMER from any non-cancel transition (403)', async () => {
    const { svc, prisma } = build();
    prisma.order.findUnique.mockResolvedValue(orderAt(OrderStatus.PENDING));

    await expect(
      svc.updateStatus(customer, 'order1', OrderStatus.CONFIRMED),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it("treats another customer's order as 404 (no existence leak)", async () => {
    const { svc, prisma } = build();
    prisma.order.findUnique.mockResolvedValue(
      orderAt(OrderStatus.PENDING, 'someoneElse'),
    );

    await expect(
      svc.updateStatus(customer, 'order1', OrderStatus.CANCELLED),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('forbids a CUSTOMER cancelling a non-PENDING order (403)', async () => {
    const { svc, prisma } = build();
    prisma.order.findUnique.mockResolvedValue(orderAt(OrderStatus.SHIPPED));

    await expect(
      svc.updateStatus(customer, 'order1', OrderStatus.CANCELLED),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});
