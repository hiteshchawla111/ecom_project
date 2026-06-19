import type { OrderStatus } from './orders';

/**
 * Valid next statuses for each order status — mirrors the API's authoritative
 * state machine (`apps/api/src/orders/order-status.ts`). The UI offers only
 * these moves; the API still enforces them (this is UX, not the boundary).
 */
const ALLOWED: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

/** The statuses an order may transition into from `status`. */
export function nextStatuses(status: OrderStatus): readonly OrderStatus[] {
  return ALLOWED[status];
}
