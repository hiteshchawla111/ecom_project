/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatus, ProductStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CheckoutDto } from './dto/checkout.dto';

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
      findMany: jest.fn(),
      count: jest.fn(),
    },
    cartItem: { deleteMany: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (cb: (tx: any) => Promise<unknown>) =>
    cb(prisma),
  );
  return prisma;
};

const build = () => {
  const prisma = makePrisma();
  const svc = new OrdersService(prisma as never, makeConfig() as never);
  return { svc, prisma };
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

/** What order.create resolves to (Decimal-as-string via the mapper's .toString()). */
const createdOrder = {
  id: 'order1',
  status: OrderStatus.PENDING,
  subtotal: '39.98',
  discountTotal: '0.00',
  taxTotal: '4.00',
  shippingTotal: '5.00',
  grandTotal: '48.98',
  ...shipping,
  shipLine2: null,
  items: [
    {
      productId: 'p1',
      productName: 'Mouse',
      unitPrice: '19.99',
      quantity: 2,
      lineTotal: '39.98',
    },
  ],
  createdAt: new Date('2026-06-17T12:00:00Z'),
};

describe('OrdersService.placeOrder', () => {
  it('creates a PENDING order with snapshotted totals + items and clears the cart', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(cartWith([activeLine()]));
    prisma.order.create.mockResolvedValue(createdOrder);

    const view = await svc.placeOrder('u1', shipping);

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
        grandTotal: '48.98',
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
          grandTotal: '48.98',
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
