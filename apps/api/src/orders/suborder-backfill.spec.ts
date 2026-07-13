import { backfillSubOrders } from './suborder-backfill';

/** Minimal in-memory-ish mock of the Prisma surface backfillSubOrders touches. */
function makePrismaMock(opts: {
  platform: { id: string } | null;
  orders: Array<{
    id: string;
    status: string;
    subtotal: string; discountTotal: string; taxTotal: string; shippingTotal: string; grandTotal: string;
    shipFullName: string; shipLine1: string; shipLine2: string | null;
    shipCity: string; shipState: string; shipCountry: string; shipPostalCode: string;
    items: Array<{ productId: string; productName: string; unitPrice: string; quantity: number; lineTotal: string }>;
    alreadyBackfilled?: boolean;
  }>;
}) {
  const createdSubOrders: any[] = [];
  const createdItems: any[] = [];
  const prisma: any = {
    seller: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.slug === 'platform' ? opts.platform : null,
      ),
    },
    order: {
      findMany: jest.fn(async () =>
        // emulate `where: { subOrders: { none: {} } }`
        opts.orders.filter((o) => !o.alreadyBackfilled),
      ),
      count: jest.fn(async () => opts.orders.length),
    },
    orderItem: {
      count: jest.fn(async () => opts.orders.reduce((n, o) => n + o.items.length, 0)),
    },
    subOrder: {
      create: jest.fn(async ({ data }: any) => {
        const so = { id: `so-${createdSubOrders.length + 1}`, ...data };
        createdSubOrders.push(so);
        return so;
      }),
      // total DB count = pre-existing (already-backfilled orders) + newly created this run
      count: jest.fn(
        async () =>
          opts.orders.filter((o) => o.alreadyBackfilled).length +
          createdSubOrders.length,
      ),
      findMany: jest.fn(async () => createdSubOrders),
    },
    subOrderItem: {
      create: jest.fn(async ({ data }: any) => {
        createdItems.push(data);
        return data;
      }),
      // total DB count = pre-existing (already-backfilled orders' items) + newly created this run
      count: jest.fn(
        async () =>
          opts.orders
            .filter((o) => o.alreadyBackfilled)
            .reduce((n, o) => n + o.items.length, 0) + createdItems.length,
      ),
    },
    // backfill wraps each order in a tx; the mock just runs the callback with itself
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  return { prisma, createdSubOrders, createdItems };
}

const ORDER = {
  id: 'o1', status: 'DELIVERED',
  subtotal: '100.00', discountTotal: '0.00', taxTotal: '8.00', shippingTotal: '5.00', grandTotal: '113.00',
  shipFullName: 'Ada L', shipLine1: '1 St', shipLine2: null,
  shipCity: 'Town', shipState: 'ST', shipCountry: 'US', shipPostalCode: '00001',
  items: [{ productId: 'p1', productName: 'Widget', unitPrice: '50.00', quantity: 2, lineTotal: '100.00' }],
};

describe('backfillSubOrders', () => {
  it('creates one SubOrder per Order, owned by the platform seller, status + totals + ship copied', async () => {
    const { prisma, createdSubOrders } = makePrismaMock({ platform: { id: 'plat' }, orders: [ORDER] });
    const result = await backfillSubOrders(prisma);

    expect(createdSubOrders).toHaveLength(1);
    const so = createdSubOrders[0];
    expect(so.sellerId).toBe('plat');
    expect(so.orderId).toBe('o1');
    expect(so.status).toBe('DELIVERED');
    expect(so.grandTotal).toBe('113.00');
    expect(so.shipFullName).toBe('Ada L');
    expect(so.shipLine2).toBeNull();
    expect(result.ordersProcessed).toBe(1);
    expect(result.subOrdersCreated).toBe(1);
  });

  it('creates one SubOrderItem per OrderItem with sellerName "Platform" and snapshot fields', async () => {
    const { prisma, createdItems } = makePrismaMock({ platform: { id: 'plat' }, orders: [ORDER] });
    await backfillSubOrders(prisma);
    expect(createdItems).toHaveLength(1);
    expect(createdItems[0]).toMatchObject({
      productId: 'p1', productName: 'Widget', unitPrice: '50.00', quantity: 2, lineTotal: '100.00',
      sellerName: 'Platform',
    });
  });

  it('is idempotent — orders already having a SubOrder are skipped (nothing created)', async () => {
    const { prisma, createdSubOrders } = makePrismaMock({
      platform: { id: 'plat' },
      orders: [{ ...ORDER, alreadyBackfilled: true }],
    });
    const result = await backfillSubOrders(prisma);
    expect(createdSubOrders).toHaveLength(0);
    expect(result.subOrdersCreated).toBe(0);
  });

  it('throws if the platform seller is missing', async () => {
    const { prisma } = makePrismaMock({ platform: null, orders: [ORDER] });
    await expect(backfillSubOrders(prisma)).rejects.toThrow(/platform seller/i);
  });

  it('throws when validation asserts fail (item count mismatch)', async () => {
    const { prisma } = makePrismaMock({ platform: { id: 'plat' }, orders: [ORDER] });
    // Force a mismatch: report more OrderItems than SubOrderItems created.
    prisma.orderItem.count = jest.fn(async () => 99);
    await expect(backfillSubOrders(prisma)).rejects.toThrow(/count\(OrderItem\)/i);
  });
});
