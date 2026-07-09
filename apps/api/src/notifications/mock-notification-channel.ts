import { Injectable, Logger } from '@nestjs/common';
import type {
  NotificationChannel,
  NotificationMessage,
} from './notification-channel';

/** Deterministic in-memory NotificationChannel (ADR-010). Logs the intended
 *  delivery; makes no external call and never throws. A real adapter (SMTP/SMS)
 *  is an env-selected swap. */
@Injectable()
export class MockNotificationChannel implements NotificationChannel {
  private readonly logger = new Logger(MockNotificationChannel.name);

  async send(message: NotificationMessage): Promise<void> {
    const target = message.userId ? `user ${message.userId}` : 'staff-queue';
    this.logger.log(`would send ${message.type} to ${target}`);
    await Promise.resolve();
  }
}
