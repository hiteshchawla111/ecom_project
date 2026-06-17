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
});
