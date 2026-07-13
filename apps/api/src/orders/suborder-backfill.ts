import type { PrismaClient } from '@prisma/client';

export interface BackfillResult {
  ordersProcessed: number;
  subOrdersCreated: number;
  subOrderItemsCreated: number;
}

const PLATFORM_SLUG = 'platform';

/**
 * Idempotent backfill: give every Order that has no SubOrder exactly one
 * Platform-Seller SubOrder (+ items copied from OrderItems). Re-runnable
 * (skips already-backfilled orders). Throws if the platform seller is missing
 * or if the post-run validation asserts fail. Runs outside Nest DI.
 */
export async function backfillSubOrders(
  prisma: PrismaClient,
): Promise<BackfillResult> {
  const platform = await prisma.seller.findUnique({
    where: { slug: PLATFORM_SLUG },
    select: { id: true },
  });
  if (!platform) {
    throw new Error(
      `Cannot backfill: platform seller (slug "${PLATFORM_SLUG}") not found — run the seed first.`,
    );
  }

  // Orders with no SubOrder yet (idempotency guard).
  const orders = await prisma.order.findMany({
    where: { subOrders: { none: {} } },
    include: { items: true },
  });

  let subOrdersCreated = 0;
  let subOrderItemsCreated = 0;

  // Per-order (order.id -> expected SubOrderItem count) guarantee, scoped to
  // just the orders processed this run — never a global OrderItem/SubOrderItem
  // total, which would be skewed by other branches' data sharing ecom_dev.
  const processedItemCounts = new Map<string, number>();

  for (const order of orders) {
    await prisma.$transaction(async (tx) => {
      const subOrder = await tx.subOrder.create({
        data: {
          orderId: order.id,
          sellerId: platform.id,
          // OrderStatus and SubOrderStatus share identical values; assignment type-checks directly.
          status: order.status,
          subtotal: order.subtotal,
          discountTotal: order.discountTotal,
          taxTotal: order.taxTotal,
          shippingTotal: order.shippingTotal,
          grandTotal: order.grandTotal,
          shipFullName: order.shipFullName,
          shipLine1: order.shipLine1,
          shipLine2: order.shipLine2,
          shipCity: order.shipCity,
          shipState: order.shipState,
          shipCountry: order.shipCountry,
          shipPostalCode: order.shipPostalCode,
        },
      });
      subOrdersCreated += 1;

      for (const item of order.items) {
        await tx.subOrderItem.create({
          data: {
            subOrderId: subOrder.id,
            productId: item.productId,
            productName: item.productName,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            lineTotal: item.lineTotal,
            sellerName: 'Platform',
          },
        });
        subOrderItemsCreated += 1;
      }
    });

    processedItemCounts.set(order.id, order.items.length);
  }

  await assertBackfillConsistent(prisma, processedItemCounts);

  return {
    ordersProcessed: orders.length,
    subOrdersCreated,
    subOrderItemsCreated,
  };
}

/**
 * Invariant checks that hold regardless of other branches/worktrees sharing
 * the dev DB (e.g. a sibling M5a-S2 branch creating N SubOrders per Order).
 * Deliberately avoids any GLOBAL count(SubOrder)/count(SubOrderItem) compare,
 * since those are only valid under "exactly one SubOrder per Order" — an
 * invariant this backfill guarantees for itself, but not one it can assume
 * holds for rows created by other in-flight work. Throws on mismatch.
 */
async function assertBackfillConsistent(
  prisma: PrismaClient,
  processedItemCounts: Map<string, number>,
): Promise<void> {
  // 1. Strongest, invariant-independent check: after a full run, no Order
  // may be left without a SubOrder.
  const remaining = await prisma.order.count({
    where: { subOrders: { none: {} } },
  });
  if (remaining !== 0) {
    throw new Error(
      `Backfill validation failed: ${remaining} order(s) remain without a SubOrder after backfill.`,
    );
  }

  // 2. Distinct-orderId parity: every Order has at least one SubOrder.
  // (Robust to other branches creating multiple SubOrders per Order — we
  // compare against DISTINCT orderId, not the raw SubOrder row count.)
  const [orderCount, subOrdersByOrder] = await Promise.all([
    prisma.order.count(),
    prisma.subOrder.findMany({
      distinct: ['orderId'],
      select: { orderId: true },
    }),
  ]);
  const distinctSubOrderOrderCount = subOrdersByOrder.length;
  if (orderCount !== distinctSubOrderOrderCount) {
    throw new Error(
      `Backfill validation failed: count(Order)=${orderCount} != count(DISTINCT SubOrder.orderId)=${distinctSubOrderOrderCount}`,
    );
  }

  // 3. Per-order item-count guarantee, scoped to orders processed THIS run
  // (never a global OrderItem/SubOrderItem total).
  for (const [orderId, expectedItemCount] of processedItemCounts) {
    const actualItemCount = await prisma.subOrderItem.count({
      where: { subOrder: { orderId } },
    });
    if (actualItemCount !== expectedItemCount) {
      throw new Error(
        `Backfill validation failed: order ${orderId} expected ${expectedItemCount} SubOrderItem(s) but found ${actualItemCount}.`,
      );
    }
  }
}
