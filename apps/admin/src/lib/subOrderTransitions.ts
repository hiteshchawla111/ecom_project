import type { SubOrderStatus } from './sellerSubOrders';

/**
 * Valid next statuses per SubOrder status — mirrors the API's authoritative
 * state machine (`apps/api/src/orders/order-status.ts`, reused on SubOrder).
 * UX only; the API still enforces the move (409 on invalid).
 */
const ALLOWED: Record<SubOrderStatus, readonly SubOrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

/** The statuses a sub-order may transition into from `status`. */
export function nextStatuses(status: SubOrderStatus): readonly SubOrderStatus[] {
  return ALLOWED[status];
}

/** Button label + confirm copy for transitioning INTO each status. */
export const ACTION: Record<
  SubOrderStatus,
  { label: string; confirm: string; destructive?: boolean }
> = {
  PENDING: { label: 'Reset to pending', confirm: 'Move this sub-order back to pending?' },
  CONFIRMED: { label: 'Confirm', confirm: 'Confirm this sub-order?' },
  PROCESSING: { label: 'Start processing', confirm: 'Mark this sub-order as processing?' },
  SHIPPED: { label: 'Mark shipped', confirm: 'Mark this sub-order as shipped? Reserved stock will be deducted.' },
  DELIVERED: { label: 'Mark delivered', confirm: 'Mark this sub-order as delivered?' },
  CANCELLED: { label: 'Cancel', confirm: 'Cancel this sub-order? Reserved stock will be released.', destructive: true },
  REFUNDED: { label: 'Refund', confirm: 'Refund this sub-order? Items will be restocked.', destructive: true },
};
