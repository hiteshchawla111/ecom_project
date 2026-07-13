/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { backfillSubOrders } from './suborder-backfill';

/** Minimal in-memory-ish mock of the Prisma surface backfillSubOrders touches. */
function makePrismaMock(opts: {
  platform: { id: string } | null;
  orders: Array<{
    id: string;
    status: string;
    subtotal: string;
    discountTotal: string;
    taxTotal: string;
    shippingTotal: string;
    grandTotal: string;
    shipFullName: string;
    shipLine1: string;
    shipLine2: string | null;
    shipCity: string;
    shipState: string;
    shipCountry: string;
    shipPostalCode: string;
    items: Array<{
      productId: string;
      productName: string;
      unitPrice: string;
      quantity: number;
      lineTotal: string;
    }>;
    alreadyBackfilled?: boolean;
  }>;
}) {
  const createdSubOrders: any[] = [];
  const createdItems: any[] = [];

  // Pre-existing SubOrders for orders already backfilled before this run,
  // so the "remaining un-backfilled" / distinct-orderId queries below see
  // consistent state for them (mirrors what a real DB already contains).
  const preExistingSubOrders = opts.orders
    .filter((o) => o.alreadyBackfilled)
    .map((o) => ({ id: `pre-${o.id}`, orderId: o.id }));
  const preExistingItemsByOrder = new Map(
    opts.orders
      .filter((o) => o.alreadyBackfilled)
      .map((o) => [o.id, o.items.length]),
  );

  const prisma: any = {
    seller: {
      findUnique: jest.fn(({ where }: any) =>
        where.slug === 'platform' ? opts.platform : null,
      ),
    },
    order: {
      findMany: jest.fn(() =>
        // emulate `where: { subOrders: { none: {} } }`
        opts.orders.filter((o) => !o.alreadyBackfilled),
      ),
      // emulate both `count()` (all orders) and
      // `count({ where: { subOrders: { none: {} } } })` (remaining un-backfilled)
      count: jest.fn((args?: any) => {
        if (args?.where?.subOrders?.none) {
          return opts.orders.filter(
            (o) =>
              !o.alreadyBackfilled &&
              !createdSubOrders.some((so) => so.orderId === o.id),
          ).length;
        }
        return opts.orders.length;
      }),
    },
    subOrder: {
      create: jest.fn(({ data }: any) => {
        const so = { id: `so-${createdSubOrders.length + 1}`, ...data };
        createdSubOrders.push(so);
        return so;
      }),
      // emulate `findMany({ distinct: ['orderId'], select: { orderId: true } })`
      findMany: jest.fn(() => {
        const all = [...preExistingSubOrders, ...createdSubOrders];
        const seen = new Set<string>();
        const distinct: Array<{ orderId: string }> = [];
        for (const so of all) {
          if (!seen.has(so.orderId)) {
            seen.add(so.orderId);
            distinct.push({ orderId: so.orderId });
          }
        }
        return distinct;
      }),
    },
    subOrderItem: {
      create: jest.fn(({ data }: any) => {
        createdItems.push(data);
        return data;
      }),
      // emulate `count({ where: { subOrder: { orderId } } })` — per-order item count
      count: jest.fn(({ where }: any) => {
        const orderId = where?.subOrder?.orderId;
        const preExisting = preExistingItemsByOrder.get(orderId) ?? 0;
        const subOrderIdsForOrder = createdSubOrders
          .filter((so) => so.orderId === orderId)
          .map((so) => so.id);
        const createdForOrder = createdItems.filter((item) =>
          subOrderIdsForOrder.includes(item.subOrderId),
        ).length;
        return preExisting + createdForOrder;
      }),
    },
    // backfill wraps each order in a tx; the mock just runs the callback with itself
    $transaction: jest.fn((cb: any) => cb(prisma)),
  };
  return { prisma, createdSubOrders, createdItems };
}

const ORDER = {
  id: 'o1',
  status: 'DELIVERED',
  subtotal: '100.00',
  discountTotal: '0.00',
  taxTotal: '8.00',
  shippingTotal: '5.00',
  grandTotal: '113.00',
  shipFullName: 'Ada L',
  shipLine1: '1 St',
  shipLine2: null,
  shipCity: 'Town',
  shipState: 'ST',
  shipCountry: 'US',
  shipPostalCode: '00001',
  items: [
    {
      productId: 'p1',
      productName: 'Widget',
      unitPrice: '50.00',
      quantity: 2,
      lineTotal: '100.00',
    },
  ],
};

describe('backfillSubOrders', () => {
  it('creates one SubOrder per Order, owned by the platform seller, status + totals + ship copied', async () => {
    const { prisma, createdSubOrders } = makePrismaMock({
      platform: { id: 'plat' },
      orders: [ORDER],
    });
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
    const { prisma, createdItems } = makePrismaMock({
      platform: { id: 'plat' },
      orders: [ORDER],
    });
    await backfillSubOrders(prisma);
    expect(createdItems).toHaveLength(1);
    expect(createdItems[0]).toMatchObject({
      productId: 'p1',
      productName: 'Widget',
      unitPrice: '50.00',
      quantity: 2,
      lineTotal: '100.00',
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

  it('throws when validation asserts fail (order left without a SubOrder)', async () => {
    const { prisma } = makePrismaMock({
      platform: { id: 'plat' },
      orders: [ORDER],
    });
    // Force a false negative on the "remaining un-backfilled" check: pretend
    // an order still has no SubOrder even after the run created one.
    prisma.order.count = jest.fn(() => 1);
    await expect(backfillSubOrders(prisma)).rejects.toThrow(
      /remain without a SubOrder/i,
    );
  });

  it('throws when distinct-orderId parity fails (count(Order) != count(DISTINCT SubOrder.orderId))', async () => {
    const { prisma } = makePrismaMock({
      platform: { id: 'plat' },
      orders: [ORDER],
    });
    // Let the "remaining un-backfilled" check pass (0), but force the
    // distinct-orderId parity check to see a stray order with no SubOrder,
    // simulating cross-branch skew from a sibling M5a-S2 worktree: report 2
    // orders total, while only 1 distinct SubOrder.orderId actually exists.
    prisma.order.count = jest.fn((args?: any) =>
      args?.where?.subOrders?.none ? 0 : 2,
    );
    await expect(backfillSubOrders(prisma)).rejects.toThrow(
      /count\(DISTINCT SubOrder\.orderId\)/i,
    );
  });
});
