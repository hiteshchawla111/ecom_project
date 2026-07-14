import { OrderStatus, SubOrderStatus } from '@prisma/client';

/** Progress rank — REFUNDED sits above DELIVERED (Delivered -> Refunded). */
const RANK: Record<SubOrderStatus, number> = {
  [SubOrderStatus.PENDING]: 0,
  [SubOrderStatus.CONFIRMED]: 1,
  [SubOrderStatus.PROCESSING]: 2,
  [SubOrderStatus.SHIPPED]: 3,
  [SubOrderStatus.DELIVERED]: 4,
  [SubOrderStatus.REFUNDED]: 5,
  [SubOrderStatus.CANCELLED]: -1, // excluded from the active calc
};

/**
 * Collapse a SubOrder's statuses into the Order's rollup status.
 * - all CANCELLED -> CANCELLED; all REFUNDED -> REFUNDED
 * - otherwise the LEAST-advanced status over the active set (excluding CANCELLED)
 * SubOrderStatus and OrderStatus share identical values, so the return casts safely.
 */
export function rollupOrderStatus(statuses: SubOrderStatus[]): OrderStatus {
  if (statuses.length > 0 && statuses.every((s) => s === SubOrderStatus.CANCELLED)) {
    return OrderStatus.CANCELLED;
  }
  if (statuses.length > 0 && statuses.every((s) => s === SubOrderStatus.REFUNDED)) {
    return OrderStatus.REFUNDED;
  }
  const active = statuses.filter((s) => s !== SubOrderStatus.CANCELLED);
  if (active.length === 0) return OrderStatus.CANCELLED;
  const leastAdvanced = active.reduce((min, s) =>
    RANK[s] < RANK[min] ? s : min,
  );
  return leastAdvanced as unknown as OrderStatus;
}
