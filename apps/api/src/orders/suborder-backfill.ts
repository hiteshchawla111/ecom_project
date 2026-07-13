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
  }

  await assertBackfillConsistent(prisma);

  return {
    ordersProcessed: orders.length,
    subOrdersCreated,
    subOrderItemsCreated,
  };
}

/** Row-count parity checks (throw on mismatch). */
async function assertBackfillConsistent(prisma: PrismaClient): Promise<void> {
  const [orderCount, subOrderCount, orderItemCount, subOrderItemCount] =
    await Promise.all([
      prisma.order.count(),
      prisma.subOrder.count(),
      prisma.orderItem.count(),
      prisma.subOrderItem.count(),
    ]);

  if (orderCount !== subOrderCount) {
    throw new Error(
      `Backfill validation failed: count(Order)=${orderCount} != count(SubOrder)=${subOrderCount}`,
    );
  }
  if (orderItemCount !== subOrderItemCount) {
    throw new Error(
      `Backfill validation failed: count(OrderItem)=${orderItemCount} != count(SubOrderItem)=${subOrderItemCount}`,
    );
  }
}
