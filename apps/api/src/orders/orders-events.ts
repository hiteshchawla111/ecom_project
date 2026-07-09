import { OrderStatus } from '@prisma/client';

/** Fired after an order is successfully placed (post-commit). */
export const ORDER_PLACED = 'order.placed';
export interface OrderPlacedEvent {
  orderId: string;
  userId: string;
}

/** Fired after an order's status transition commits (post-commit). */
export const ORDER_STATUS_CHANGED_EVENT = 'order.status.changed';
export interface OrderStatusChangedEvent {
  orderId: string;
  userId: string;
  status: OrderStatus;
}
