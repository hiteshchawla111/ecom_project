import { NotificationType } from '@prisma/client';

/** DI token for the swappable notification-delivery channel (ADR-009). */
export const NOTIFICATION_CHANNEL = Symbol('NOTIFICATION_CHANNEL');

/** The persisted-notification shape handed to a delivery channel.
 *  A real adapter maps type→template and resolves userId→email/phone at its edge. */
export interface NotificationMessage {
  type: NotificationType;
  userId: string | null; // null = staff/admin queue
  payload: unknown;
}

/** Out-of-band delivery of a persisted notification (email/SMS/…). ADR-009/010. */
export interface NotificationChannel {
  send(message: NotificationMessage): Promise<void>;
}
