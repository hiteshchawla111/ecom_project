import { OrderStatus, SubOrderStatus } from '@prisma/client';

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

/** Fired after a sub-order's status transition commits (post-commit). */
export const SUBORDER_STATUS_CHANGED_EVENT = 'suborder.status.changed';
export interface SubOrderStatusChangedEvent {
  subOrderId: string;
  orderId: string;
  sellerId: string;
  status: SubOrderStatus;
}
