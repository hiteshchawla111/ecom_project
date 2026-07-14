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
import {
  OrderStatus,
  ProductStatus,
  Role,
  SubOrderStatus,
} from '@prisma/client';
import { OrdersService } from './orders.service';
import { CheckoutDto } from './dto/checkout.dto';
import type { AccessTokenPayload } from '../auth/auth-tokens';
import {
  ORDER_STATUS_CHANGED,
  SUBORDER_STATUS_CHANGED,
} from '../audit/audit-actions';
import {
  ORDER_STATUS_CHANGED_EVENT,
  SUBORDER_STATUS_CHANGED_EVENT,
} from './orders-events';
import { moneyStringToCents } from './sum-totals';

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
    auditLog: { create: jest.fn() },
    subOrder: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };
  prisma.$transaction = jest.fn(async (cb: (tx: any) => Promise<unknown>) =>
    cb(prisma),
  );
  prisma.subOrder.create = jest.fn(({ data }: any) => ({
    id: `sub-${data.sellerId}`,
    ...data,
  }));
  return prisma;
};

const makeInventory = () => ({
  reserve: jest.fn().mockResolvedValue(null),
  release: jest.fn().mockResolvedValue(undefined),
  deduct: jest.fn().mockResolvedValue(undefined),
  restock: jest.fn().mockResolvedValue(undefined),
  emitLowStock: jest.fn(),
});

const makeAudit = () => ({
  record: jest.fn().mockResolvedValue(undefined),
});

const makeEvents = () => ({
  emit: jest.fn(),
});

const build = () => {
  const prisma = makePrisma();
  const inventory = makeInventory();
  const audit = makeAudit();
  const events = makeEvents();
  const svc = new OrdersService(
    prisma as never,
    makeConfig() as never,
    inventory as never,
    audit as never,
    events as never,
  );
  return { svc, prisma, inventory, audit, events };
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
    seller: { id: 's1', displayName: 'Shop One' },
  },
  ...over,
});

const activeProduct = (sellerId: string, displayName: string) => ({
  name: 'Mouse',
  price: '19.99',
  salePrice: null,
  status: ProductStatus.ACTIVE,
  deletedAt: null,
  seller: { id: sellerId, displayName },
});

/**
 * What order.create resolves to.  Money fields intentionally use integer-like
 * strings (e.g. '16', '5') that Prisma.Decimal.toString() would return without
 * trailing zeros — the money() helper must normalise them to 2-dp strings.
 */
const createdOrder = {
  id: 'order1',
  userId: 'u1',
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

    // reserves each line's stock within the placement transaction (tx passed),
    // referencing its owning subOrderId (5th arg)
    expect(inventory.reserve).toHaveBeenCalledWith(
      'p1',
      2,
      'order1',
      prisma,
      'sub-s1',
    );

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

  it('emits order.placed after placement commits', async () => {
    const { svc, prisma, events } = build();
    prisma.cart.findFirst.mockResolvedValue(cartWith([activeLine()]));
    prisma.order.create.mockResolvedValue(createdOrder);

    await svc.placeOrder('u1', shipping);

    expect(events.emit).toHaveBeenCalledWith('order.placed', {
      orderId: 'order1',
      userId: 'u1',
    });
  });

  it('does NOT emit order.placed when placement fails/rolls back', async () => {
    const { svc, prisma, events } = build();
    prisma.cart.findFirst.mockResolvedValue(cartWith([]));

    await expect(svc.placeOrder('u1', shipping)).rejects.toBeTruthy();

    expect(events.emit).not.toHaveBeenCalledWith(
      'order.placed',
      expect.anything(),
    );
  });
});

describe('OrdersService.placeOrder — order split', () => {
  it('creates one SubOrder per distinct seller with its own items + sellerName', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(
      cartWith([
        activeLine({
          productId: 'p1',
          product: { ...activeProduct('s1', 'Shop One') },
        }),
        activeLine({
          productId: 'p2',
          product: { ...activeProduct('s2', 'Shop Two') },
        }),
      ]),
    );
    prisma.order.create.mockResolvedValue(createdOrder);
    await svc.placeOrder('u1', shipping);

    expect(prisma.subOrder.create).toHaveBeenCalledTimes(2);
    const sellerIds = prisma.subOrder.create.mock.calls.map(
      (c: any) => c[0].data.sellerId,
    );
    expect(sellerIds.sort()).toEqual(['s1', 's2']);
    // each SubOrder carries the shipping snapshot + PENDING status
    const first = prisma.subOrder.create.mock.calls[0][0].data;
    expect(first.status).toBe('PENDING');
    expect(first.shipFullName).toBe(shipping.shipFullName);
    // SubOrderItems carry sellerName
    expect(first.items.create[0].sellerName).toBeDefined();
  });

  it('creates ONE Order whose totals equal the sum of the SubOrders (parity)', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(
      cartWith([
        activeLine({
          productId: 'p1',
          product: { ...activeProduct('s1', 'Shop One') },
        }),
        activeLine({
          productId: 'p2',
          product: { ...activeProduct('s2', 'Shop Two') },
        }),
      ]),
    );
    prisma.order.create.mockResolvedValue(createdOrder);
    await svc.placeOrder('u1', shipping);

    const orderData = prisma.order.create.mock.calls[0][0].data;
    const subCalls = prisma.subOrder.create.mock.calls.map(
      (c: any) => c[0].data,
    );
    const sumCents = (f: string) =>
      subCalls.reduce((n: number, s: any) => n + moneyStringToCents(s[f]), 0);
    // Order component == sum of SubOrder components (integer-cents equality)
    expect(moneyStringToCents(orderData.grandTotal)).toBe(
      sumCents('grandTotal'),
    );
    expect(moneyStringToCents(orderData.subtotal)).toBe(sumCents('subtotal'));
    expect(moneyStringToCents(orderData.shippingTotal)).toBe(
      sumCents('shippingTotal'),
    );
    // Order still gets ALL OrderItems (dual-write)
    expect(orderData.items.create).toHaveLength(2);
  });

  it('reserves each line with its owning subOrderId (5th arg)', async () => {
    const { svc, prisma, inventory } = build();
    prisma.cart.findFirst.mockResolvedValue(
      cartWith([
        activeLine({
          productId: 'p1',
          product: { ...activeProduct('s1', 'Shop One') },
        }),
      ]),
    );
    prisma.order.create.mockResolvedValue(createdOrder);
    await svc.placeOrder('u1', shipping);
    // reserve(productId, qty, orderId, tx, subOrderId)
    expect(inventory.reserve).toHaveBeenCalledWith(
      'p1',
      2,
      'order1',
      prisma,
      'sub-s1',
    );
  });

  it('single-seller cart → 1 Order + 1 SubOrder', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(
      cartWith([
        activeLine({
          productId: 'p1',
          product: { ...activeProduct('s1', 'Shop One') },
        }),
      ]),
    );
    prisma.order.create.mockResolvedValue(createdOrder);
    await svc.placeOrder('u1', shipping);
    expect(prisma.subOrder.create).toHaveBeenCalledTimes(1);
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

describe('OrdersService.updateStatus (customer self-cancel-all-suborders)', () => {
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

  /** A sub-order row belonging to `orderId`, at a given status. */
  const subOrderRow = (
    id: string,
    status: SubOrderStatus,
    over: Record<string, unknown> = {},
  ) => ({
    id,
    orderId: 'order1',
    sellerId: `seller-${id}`,
    status,
    items: [{ productId: 'p1', quantity: 2 }],
    ...over,
  });

  /** A stored order row (with subOrders), owned by `userId` (default u1). */
  const orderAt = (
    status: OrderStatus,
    subOrders: ReturnType<typeof subOrderRow>[],
    userId = 'u1',
  ) => ({
    ...createdOrder,
    status,
    userId,
    subOrders,
  });

  it('cancels every sub-order of an all-PENDING order (release per item w/ subOrderId) + rolls Order to CANCELLED', async () => {
    const { svc, prisma, inventory, audit, events } = build();
    const subs = [
      subOrderRow('sub1', SubOrderStatus.PENDING),
      subOrderRow('sub2', SubOrderStatus.PENDING, {
        sellerId: 'seller-sub2',
        items: [{ productId: 'p2', quantity: 3 }],
      }),
    ];
    prisma.order.findUnique
      .mockResolvedValueOnce(orderAt(OrderStatus.PENDING, subs))
      .mockResolvedValueOnce(orderAt(OrderStatus.CANCELLED, subs));

    const view = await svc.updateStatus(
      customer,
      'order1',
      OrderStatus.CANCELLED,
    );

    expect(view.status).toBe(OrderStatus.CANCELLED);
    // stock released per sub-order item, tagged with that sub-order's id
    expect(inventory.release).toHaveBeenCalledWith(
      'p1',
      2,
      'order1',
      prisma,
      'sub1',
    );
    expect(inventory.release).toHaveBeenCalledWith(
      'p2',
      3,
      'order1',
      prisma,
      'sub2',
    );
    expect(inventory.release).toHaveBeenCalledTimes(2);
    // each sub-order flipped to CANCELLED
    expect(prisma.subOrder.update).toHaveBeenCalledWith({
      where: { id: 'sub1' },
      data: { status: SubOrderStatus.CANCELLED },
    });
    expect(prisma.subOrder.update).toHaveBeenCalledWith({
      where: { id: 'sub2' },
      data: { status: SubOrderStatus.CANCELLED },
    });
    // order rolled up to CANCELLED
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order1' },
      data: { status: OrderStatus.CANCELLED },
    });
    // audit: 1 SUBORDER_STATUS_CHANGED per sub-order + 1 ORDER_STATUS_CHANGED
    expect(audit.record).toHaveBeenCalledTimes(3);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: SUBORDER_STATUS_CHANGED,
        entityType: 'SubOrder',
        entityId: 'sub1',
      }),
      prisma,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: SUBORDER_STATUS_CHANGED,
        entityType: 'SubOrder',
        entityId: 'sub2',
      }),
      prisma,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ORDER_STATUS_CHANGED,
        entityType: 'Order',
        entityId: 'order1',
        metadata: { from: OrderStatus.PENDING, to: OrderStatus.CANCELLED },
      }),
      prisma,
    );
    // events: 1 per sub-order + 1 order-level rollup event
    const emitted = events.emit.mock.calls.map((c: any) => c[0]);
    expect(
      emitted.filter((n: string) => n === SUBORDER_STATUS_CHANGED_EVENT),
    ).toHaveLength(2);
    expect(events.emit).toHaveBeenCalledWith(SUBORDER_STATUS_CHANGED_EVENT, {
      subOrderId: 'sub1',
      orderId: 'order1',
      sellerId: 'seller-sub1',
      status: SubOrderStatus.CANCELLED,
    });
    expect(events.emit).toHaveBeenCalledWith(ORDER_STATUS_CHANGED_EVENT, {
      orderId: 'order1',
      userId: 'u1',
      status: OrderStatus.CANCELLED,
    });
    // final read uses ORDER_INCLUDE (items) for the unchanged response shape
    expect(prisma.order.findUnique).toHaveBeenLastCalledWith({
      where: { id: 'order1' },
      include: { items: true },
    });
  });

  it('rejects self-cancel with 409 when any sub-order has progressed past PENDING', async () => {
    const { svc, prisma } = build();
    const subs = [
      subOrderRow('sub1', SubOrderStatus.CONFIRMED),
      subOrderRow('sub2', SubOrderStatus.PENDING),
    ];
    prisma.order.findUnique.mockResolvedValue(
      orderAt(OrderStatus.PENDING, subs),
    );

    await expect(
      svc.updateStatus(customer, 'order1', OrderStatus.CANCELLED),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.subOrder.update).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('rejects any non-CANCELLED target status with 403 (no other self-service transition)', async () => {
    const { svc, prisma } = build();
    const subs = [subOrderRow('sub1', SubOrderStatus.PENDING)];
    prisma.order.findUnique.mockResolvedValue(
      orderAt(OrderStatus.PENDING, subs),
    );

    await expect(
      svc.updateStatus(customer, 'order1', OrderStatus.CONFIRMED),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it("treats another customer's order as 404 (no existence leak)", async () => {
    const { svc, prisma } = build();
    const subs = [subOrderRow('sub1', SubOrderStatus.PENDING)];
    prisma.order.findUnique.mockResolvedValue(
      orderAt(OrderStatus.PENDING, subs, 'someoneElse'),
    );

    await expect(
      svc.updateStatus(customer, 'order1', OrderStatus.CANCELLED),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('throws 404 for an unknown order', async () => {
    const { svc, prisma } = build();
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(
      svc.updateStatus(admin, 'nope', OrderStatus.CANCELLED),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('rejects a self-cancel with no sub-orders at all (409)', async () => {
    const { svc, prisma } = build();
    prisma.order.findUnique.mockResolvedValue(orderAt(OrderStatus.PENDING, []));

    await expect(
      svc.updateStatus(customer, 'order1', OrderStatus.CANCELLED),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});

describe('OrdersService.listAllOrders (admin)', () => {
  it('returns all orders newest-first with customer info, paginated', async () => {
    const { svc, prisma } = build();
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'o9',
        status: OrderStatus.PENDING,
        grandTotal: '16',
        createdAt: new Date('2026-06-18T12:00:00Z'),
        user: { email: 'ada@shop.test', name: 'Ada Lovelace' },
        _count: { items: 3 },
      },
    ]);
    prisma.order.count.mockResolvedValue(1);

    const res = await svc.listAllOrders({});

    const findArg = prisma.order.findMany.mock.calls[0][0];
    // NOT scoped to any user — all orders
    expect(findArg.where).toEqual({});
    expect(findArg.orderBy).toEqual({ createdAt: 'desc' });
    expect(res.data).toEqual([
      {
        id: 'o9',
        status: OrderStatus.PENDING,
        grandTotal: '16.00',
        itemCount: 3,
        customerEmail: 'ada@shop.test',
        customerName: 'Ada Lovelace',
        createdAt: new Date('2026-06-18T12:00:00Z'),
      },
    ]);
    expect(res.total).toBe(1);
  });

  it('filters by status when provided', async () => {
    const { svc, prisma } = build();
    prisma.order.findMany.mockResolvedValue([]);
    prisma.order.count.mockResolvedValue(0);

    await svc.listAllOrders({ status: OrderStatus.SHIPPED });

    expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({
      status: OrderStatus.SHIPPED,
    });
    expect(prisma.order.count).toHaveBeenCalledWith({
      where: { status: OrderStatus.SHIPPED },
    });
  });
});

describe('OrdersService.hasDeliveredProduct', () => {
  it('returns true when a DELIVERED order contains the product', async () => {
    const { svc, prisma } = build();
    prisma.order.findFirst.mockResolvedValue({ id: 'o1' });

    await expect(svc.hasDeliveredProduct('u1', 'p1')).resolves.toBe(true);

    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        status: OrderStatus.DELIVERED,
        items: { some: { productId: 'p1' } },
      },
      select: { id: true },
    });
  });

  it('returns false when there is no matching delivered order', async () => {
    const { svc, prisma } = build();
    prisma.order.findFirst.mockResolvedValue(null);

    await expect(svc.hasDeliveredProduct('u1', 'p1')).resolves.toBe(false);
  });
});

describe('OrdersService.getAnyOrder (admin)', () => {
  it('returns any order (not ownership-scoped) with items + customer', async () => {
    const { svc, prisma } = build();
    prisma.order.findUnique.mockResolvedValue({
      ...createdOrder,
      user: { email: 'ada@shop.test', name: 'Ada Lovelace' },
    });

    const view = await svc.getAnyOrder('order1');

    const arg = prisma.order.findUnique.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'order1' });
    expect(view.id).toBe('order1');
    expect(view.customerEmail).toBe('ada@shop.test');
    expect(view.customerName).toBe('Ada Lovelace');
    expect(view.grandTotal).toBe('16.00');
    expect(view.items[0].unitPrice).toBe('5.00');
  });

  it('throws 404 for an unknown order', async () => {
    const { svc, prisma } = build();
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(svc.getAnyOrder('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

/** A stored SubOrder row (with items) as returned by findMany, for list tests. */
const subOrderRow = (id: string) => ({
  id,
  orderId: `order-${id}`,
  sellerId: 's1',
  status: SubOrderStatus.PENDING,
  subtotal: '10',
  discountTotal: '0',
  taxTotal: '1',
  shippingTotal: '5',
  grandTotal: '16',
  shipFullName: 'Ada',
  shipLine1: '1 St',
  shipLine2: null,
  shipCity: 'London',
  shipState: 'LDN',
  shipCountry: 'UK',
  shipPostalCode: 'EC1',
  items: [
    {
      productId: 'p1',
      productName: 'Mouse',
      unitPrice: '5',
      quantity: 2,
      lineTotal: '10',
      sellerName: 'Shop One',
    },
  ],
  createdAt: new Date('2026-07-01T00:00:00Z'),
});

describe('OrdersService.listSellerSubOrders', () => {
  it('scopes to the seller and cursor-paginates createdAt DESC, id DESC', async () => {
    const { svc, prisma } = build();
    const rows = [
      { ...subOrderRow('a'), createdAt: new Date('2026-07-03T00:00:00Z') },
      { ...subOrderRow('b'), createdAt: new Date('2026-07-02T00:00:00Z') },
    ];
    prisma.subOrder.findMany.mockResolvedValue(rows);
    const res = await svc.listSellerSubOrders(
      { role: Role.SELLER, sellerId: 's1' },
      { limit: 20 },
    );
    const arg = prisma.subOrder.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ sellerId: 's1' });
    expect(arg.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(arg.take).toBe(21);
    expect(res.data).toHaveLength(2);
    expect(res.nextCursor).toBeNull();
  });

  it('sets nextCursor and trims when more than limit rows return', async () => {
    const { svc, prisma } = build();
    const rows = Array.from({ length: 3 }, (_, i) => ({
      ...subOrderRow(`x${i}`),
      createdAt: new Date(`2026-07-0${3 - i}T00:00:00Z`),
    }));
    prisma.subOrder.findMany.mockResolvedValue(rows);
    const res = await svc.listSellerSubOrders(
      { role: Role.SELLER, sellerId: 's1' },
      { limit: 2 },
    );
    expect(res.data).toHaveLength(2);
    expect(res.nextCursor).toMatch(/_x1$/); // last kept row id
  });

  it('admin scope is unscoped (no sellerId in where)', async () => {
    const { svc, prisma } = build();
    prisma.subOrder.findMany.mockResolvedValue([]);
    await svc.listSellerSubOrders({ role: Role.ADMIN }, {});
    const arg = prisma.subOrder.findMany.mock.calls[0][0];
    expect(arg.where.sellerId).toBeUndefined();
  });
});

describe('OrdersService.transitionSubOrder', () => {
  const subOrder = (over: Record<string, unknown> = {}) => ({
    id: 'sub1',
    orderId: 'order1',
    sellerId: 's1',
    status: SubOrderStatus.PENDING,
    subtotal: '10',
    discountTotal: '0',
    taxTotal: '1',
    shippingTotal: '5',
    grandTotal: '16',
    shipFullName: 'Ada',
    shipLine1: '1 St',
    shipLine2: null,
    shipCity: 'London',
    shipState: 'LDN',
    shipCountry: 'UK',
    shipPostalCode: 'EC1',
    items: [
      {
        productId: 'p1',
        productName: 'Mouse',
        unitPrice: '5',
        quantity: 2,
        lineTotal: '10',
        sellerName: 'Shop One',
      },
    ],
    order: { id: 'order1', userId: 'u1' },
    ...over,
  });

  it('404s when the sub-order is not in the actor scope', async () => {
    const { svc, prisma } = build();
    prisma.subOrder.findFirst.mockResolvedValue(null);
    await expect(
      svc.transitionSubOrder(
        { sub: 'u1', role: Role.SELLER, sellerId: 's1' },
        'sub1',
        SubOrderStatus.CONFIRMED,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409s on an invalid transition', async () => {
    const { svc, prisma } = build();
    prisma.subOrder.findFirst.mockResolvedValue(
      subOrder({ status: SubOrderStatus.PENDING }),
    );
    await expect(
      svc.transitionSubOrder(
        { sub: 'u1', role: Role.ADMIN },
        'sub1',
        SubOrderStatus.SHIPPED,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('SHIPPED deducts stock per item with subOrderId, updates the suborder, rolls up the order', async () => {
    const { svc, prisma, inventory } = build();
    // start at PROCESSING so PROCESSING->SHIPPED is valid
    prisma.subOrder.findFirst.mockResolvedValue(
      subOrder({ status: SubOrderStatus.PROCESSING }),
    );
    prisma.subOrder.update.mockResolvedValue(
      subOrder({ status: SubOrderStatus.SHIPPED }),
    );
    // sibling statuses after update: this one SHIPPED + another PENDING -> rollup PENDING
    prisma.subOrder.findMany.mockResolvedValue([
      { status: SubOrderStatus.SHIPPED },
      { status: SubOrderStatus.PENDING },
    ]);
    prisma.order.findFirst = jest.fn(); // not used
    await svc.transitionSubOrder(
      { sub: 'admin', role: Role.ADMIN },
      'sub1',
      SubOrderStatus.SHIPPED,
    );
    expect(inventory.deduct).toHaveBeenCalledWith(
      'p1',
      2,
      'order1',
      prisma,
      'sub1',
    );
    expect(prisma.subOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub1' },
        data: { status: SubOrderStatus.SHIPPED },
      }),
    );
    // rollup writes Order.status = PENDING (least-advanced of [SHIPPED, PENDING])
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order1' },
        data: { status: OrderStatus.PENDING },
      }),
    );
  });

  it('emits suborder event always + order event only when rollup changes Order.status', async () => {
    const { svc, prisma, events } = build();
    prisma.subOrder.findFirst.mockResolvedValue(
      subOrder({
        status: SubOrderStatus.PENDING,
        order: { id: 'order1', userId: 'u1' },
      }),
    );
    prisma.subOrder.update.mockResolvedValue(
      subOrder({ status: SubOrderStatus.CONFIRMED }),
    );
    // both siblings CONFIRMED -> order rolls to CONFIRMED (changed from PENDING)
    prisma.subOrder.findMany.mockResolvedValue([
      { status: SubOrderStatus.CONFIRMED },
      { status: SubOrderStatus.CONFIRMED },
    ]);
    prisma.order.update = jest.fn().mockResolvedValue({});
    await svc.transitionSubOrder(
      { sub: 'admin', role: Role.ADMIN },
      'sub1',
      SubOrderStatus.CONFIRMED,
    );
    const emitted = events.emit.mock.calls.map((c: any) => c[0]);
    expect(emitted).toContain(SUBORDER_STATUS_CHANGED_EVENT);
    expect(emitted).toContain(ORDER_STATUS_CHANGED_EVENT);
  });
});
