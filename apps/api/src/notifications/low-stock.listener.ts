import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { LOW_STOCK_EVENT } from '../inventory/inventory.events';
import type { LowStockEvent } from '../inventory/inventory.events';
import { NotificationsService } from './notifications.service';

/**
 * Listens for inventory low-stock domain events and persists an alert.
 * Decouples notification writes from the inventory request handlers
 * (CLAUDE.md: notifications fire on domain events, not inline).
 */
@Injectable()
export class LowStockListener {
  private readonly logger = new Logger(LowStockListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(LOW_STOCK_EVENT)
  async handle(event: LowStockEvent): Promise<void> {
    // The emitter suppresses listener errors by default, so a failed write
    // would vanish silently. Log it explicitly so a dropped alert is visible.
    try {
      await this.notifications.recordLowStock(event);
    } catch (err) {
      this.logger.error(
        `Failed to record low-stock alert for product ${event.productId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
