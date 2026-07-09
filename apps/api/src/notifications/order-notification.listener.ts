import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ORDER_PLACED,
  ORDER_STATUS_CHANGED_EVENT,
} from '../orders/orders-events';
import type {
  OrderPlacedEvent,
  OrderStatusChangedEvent,
} from '../orders/orders-events';
import { NotificationsService } from './notifications.service';

/** Persists order notifications on order domain events (fire on events, not inline). */
@Injectable()
export class OrderNotificationListener {
  private readonly logger = new Logger(OrderNotificationListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(ORDER_PLACED)
  async onPlaced(event: OrderPlacedEvent): Promise<void> {
    try {
      await this.notifications.recordOrderPlaced(event);
    } catch (err) {
      this.logger.error(
        `Failed to record order-placed notification for order ${event.orderId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  @OnEvent(ORDER_STATUS_CHANGED_EVENT)
  async onStatus(event: OrderStatusChangedEvent): Promise<void> {
    try {
      await this.notifications.recordOrderStatus(event);
    } catch (err) {
      this.logger.error(
        `Failed to record order-status notification for order ${event.orderId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
