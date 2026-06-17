import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { CartService } from './cart.service';

const makePrisma = () => ({
  cart: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  cartItem: {
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  product: {
    findFirst: jest.fn(),
  },
});

// ConfigService stub returning our fixed rates.
const makeConfig = () => ({
  get: (key: string) =>
    ({
      TAX_RATE: '0.1',
      SHIPPING_FLAT: '5.00',
      FREE_SHIPPING_THRESHOLD: '50.00',
    })[key],
});

const build = () => {
  const prisma = makePrisma();
  const svc = new CartService(prisma as never, makeConfig() as never);
  return { svc, prisma };
};

/** A persisted cart row with one ACTIVE product line priced at 19.99 x2. */
const cartWithLine = {
  id: 'cart1',
  items: [
    {
      productId: 'p1',
      quantity: 2,
      product: {
        id: 'p1',
        name: 'Mouse',
        price: '19.99',
        salePrice: null,
        status: ProductStatus.ACTIVE,
        images: [{ url: 'http://img/mouse.jpg', position: 0 }],
      },
    },
  ],
};

describe('CartService.getCart', () => {
  it('returns the existing cart with computed totals', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(cartWithLine);

    const view = await svc.getCart('u1');

    expect(prisma.cart.create).not.toHaveBeenCalled();
    expect(view.id).toBe('cart1');
    expect(view.items).toEqual([
      {
        productId: 'p1',
        name: 'Mouse',
        unitPrice: '19.99',
        quantity: 2,
        lineTotal: '39.98',
        image: 'http://img/mouse.jpg',
      },
    ]);
    expect(view.totals).toEqual({
      subtotal: '39.98',
      discountTotal: '0.00',
      taxTotal: '4.00',
      shippingTotal: '5.00',
      grandTotal: '48.98',
    });
  });

  it('creates an empty cart when the user has none', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(null);
    prisma.cart.create.mockResolvedValue({ id: 'new1', items: [] });

    const view = await svc.getCart('u1');

    expect(prisma.cart.create).toHaveBeenCalled();
    expect(view.id).toBe('new1');
    expect(view.items).toEqual([]);
    expect(view.totals.grandTotal).toBe('0.00');
  });

  it('uses the sale price when it is below the regular price', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue({
      id: 'cart1',
      items: [
        {
          productId: 'p1',
          quantity: 1,
          product: {
            id: 'p1',
            name: 'Mouse',
            price: '19.99',
            salePrice: '9.99',
            status: ProductStatus.ACTIVE,
            images: [],
          },
        },
      ],
    });

    const view = await svc.getCart('u1');
    expect(view.items[0].unitPrice).toBe('9.99');
    expect(view.items[0].lineTotal).toBe('9.99');
    expect(view.items[0].image).toBeNull();
  });

  it('uses a $0 sale price (Decimal 0 is not coerced to null)', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue({
      id: 'cart1',
      items: [
        {
          productId: 'p1',
          quantity: 1,
          product: {
            id: 'p1',
            name: 'Freebie',
            price: '19.99',
            salePrice: '0.00',
            status: ProductStatus.ACTIVE,
            images: [],
          },
        },
      ],
    });

    const view = await svc.getCart('u1');
    expect(view.items[0].unitPrice).toBe('0.00');
    expect(view.items[0].lineTotal).toBe('0.00');
  });

  it('uses the regular price when salePrice is NOT strictly below price', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue({
      id: 'cart1',
      items: [
        {
          productId: 'p1',
          quantity: 1,
          product: {
            id: 'p1',
            name: 'Widget',
            price: '19.99',
            salePrice: '25.00',
            status: ProductStatus.ACTIVE,
            images: [],
          },
        },
      ],
    });

    const view = await svc.getCart('u1');
    expect(view.items[0].unitPrice).toBe('19.99');
  });
});

/** A bare cart row (no lines) used to anchor mutations. */
const emptyCart = { id: 'cart1', userId: 'u1', items: [] };

describe('CartService.addItem', () => {
  it('rejects an unknown product with 404', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(emptyCart);
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(svc.addItem('u1', 'nope', 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a non-ACTIVE product with 400', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(emptyCart);
    prisma.product.findFirst.mockResolvedValue({
      id: 'p1',
      status: ProductStatus.ARCHIVED,
    });

    await expect(svc.addItem('u1', 'p1', 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('upserts the line (increment on conflict) then returns the envelope', async () => {
    const { svc, prisma } = build();
    // First findFirst: getOrCreate in addItem. Second: reload in getCart.
    prisma.cart.findFirst
      .mockResolvedValueOnce(emptyCart)
      .mockResolvedValueOnce(cartWithLine);
    prisma.product.findFirst.mockResolvedValue({
      id: 'p1',
      status: ProductStatus.ACTIVE,
    });
    prisma.cartItem.upsert.mockResolvedValue({});

    const view = await svc.addItem('u1', 'p1', 2);

    const [call] = prisma.cartItem.upsert.mock.calls as Array<
      [{ create: unknown; update: unknown }]
    >;
    expect(call[0].create).toEqual(
      expect.objectContaining({
        cartId: 'cart1',
        productId: 'p1',
        quantity: 2,
      }),
    );
    expect(call[0].update).toEqual({ quantity: { increment: 2 } });
    expect(view.totals.grandTotal).toBe('48.98');
  });
});

describe('CartService.setItemQuantity', () => {
  it('removes the line when quantity is 0', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst
      .mockResolvedValueOnce(emptyCart)
      .mockResolvedValueOnce(emptyCart);
    prisma.cartItem.deleteMany.mockResolvedValue({ count: 1 });

    await svc.setItemQuantity('u1', 'p1', 0);

    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: 'cart1', productId: 'p1' },
    });
    expect(prisma.cartItem.update).not.toHaveBeenCalled();
  });

  it('sets the absolute quantity for a positive value', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst
      .mockResolvedValueOnce(emptyCart)
      .mockResolvedValueOnce(cartWithLine);
    prisma.product.findFirst.mockResolvedValue({
      id: 'p1',
      status: ProductStatus.ACTIVE,
    });
    prisma.cartItem.update.mockResolvedValue({});

    await svc.setItemQuantity('u1', 'p1', 5);

    const [call] = prisma.cartItem.update.mock.calls as Array<
      [{ data: unknown }]
    >;
    expect(call[0].data).toEqual({ quantity: 5 });
  });
});

describe('CartService.removeItem', () => {
  it('deletes the line and returns the envelope (idempotent)', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst
      .mockResolvedValueOnce(emptyCart)
      .mockResolvedValueOnce(emptyCart);
    prisma.cartItem.deleteMany.mockResolvedValue({ count: 0 });

    const view = await svc.removeItem('u1', 'p1');

    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: 'cart1', productId: 'p1' },
    });
    expect(view.items).toEqual([]);
  });
});

describe('CartService.clear', () => {
  it('deletes all lines in the cart', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst
      .mockResolvedValueOnce(emptyCart)
      .mockResolvedValueOnce(emptyCart);
    prisma.cartItem.deleteMany.mockResolvedValue({ count: 3 });

    await svc.clear('u1');

    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: 'cart1' },
    });
  });
});
