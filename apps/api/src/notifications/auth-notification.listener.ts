import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AUTH_REGISTERED } from '../auth/auth-events';
import type { AuthRegisteredEvent } from '../auth/auth-events';
import { NotificationsService } from './notifications.service';

/** Persists a registration-confirmation notification when a user registers.
 *  Notifications fire on domain events, not inline (CLAUDE.md). */
@Injectable()
export class AuthNotificationListener {
  private readonly logger = new Logger(AuthNotificationListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(AUTH_REGISTERED)
  async handle(event: AuthRegisteredEvent): Promise<void> {
    try {
      await this.notifications.recordRegistration(event);
    } catch (err) {
      this.logger.error(
        `Failed to record registration notification for user ${event.userId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
