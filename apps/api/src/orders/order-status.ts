/**
 * Order status state machine (PRD: Order Status Flow).
 *
 *   Pending → Confirmed → Processing → Shipped → Delivered
 *          ↘ Cancelled              (post-payment) ↘ Refunded
 *
 * Pure logic — no DB, no framework. The single source of truth for which
 * order-status transitions are legal. Services MUST guard transitions with
 * `assertTransition` before persisting a status change.
 */

export enum OrderStatus {
  Pending = 'Pending',
  Confirmed = 'Confirmed',
  Processing = 'Processing',
  Shipped = 'Shipped',
  Delivered = 'Delivered',
  Cancelled = 'Cancelled',
  Refunded = 'Refunded',
}

/** Allowed next states for each status. Terminal states map to an empty list. */
const ALLOWED_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  [OrderStatus.Pending]: [OrderStatus.Confirmed, OrderStatus.Cancelled],
  [OrderStatus.Confirmed]: [OrderStatus.Processing, OrderStatus.Cancelled],
  [OrderStatus.Processing]: [OrderStatus.Shipped, OrderStatus.Cancelled],
  [OrderStatus.Shipped]: [OrderStatus.Delivered],
  [OrderStatus.Delivered]: [OrderStatus.Refunded],
  [OrderStatus.Cancelled]: [],
  [OrderStatus.Refunded]: [],
};

/** True if `from → to` is a legal transition. Same-state (no-op) is not allowed. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export class InvalidOrderTransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(`Invalid order status transition: ${from} → ${to}`);
    this.name = 'InvalidOrderTransitionError';
  }
}

/** Throws {@link InvalidOrderTransitionError} unless `from → to` is legal. */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}
