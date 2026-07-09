import { ApiAuthError } from '@/lib/api-auth';
import type { NotificationPage, ListNotificationsQuery } from '@/lib/notifications';

export interface NotificationHandlerResult {
  status: number;
  body: unknown;
}

/** Injectable notification operations so handlers are testable without cookies/Next. */
export interface NotificationsRouteDeps {
  list(query: ListNotificationsQuery): Promise<NotificationPage>;
  unreadCount(): Promise<{ count: number }>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<{ updated: number }>;
}

/** Map an upstream API error to a client result; rethrow the unexpected. */
function fromApiError(err: unknown): NotificationHandlerResult {
  if (err instanceof ApiAuthError) return { status: err.status, body: { message: err.message } };
  throw err;
}

export async function handleList(query: ListNotificationsQuery, deps: NotificationsRouteDeps): Promise<NotificationHandlerResult> {
  try { return { status: 200, body: await deps.list(query) }; }
  catch (err) { return fromApiError(err); }
}
export async function handleUnreadCount(deps: NotificationsRouteDeps): Promise<NotificationHandlerResult> {
  try { return { status: 200, body: await deps.unreadCount() }; }
  catch (err) { return fromApiError(err); }
}
export async function handleMarkRead(id: string, deps: NotificationsRouteDeps): Promise<NotificationHandlerResult> {
  try { await deps.markRead(id); return { status: 204, body: null }; }
  catch (err) { return fromApiError(err); }
}
export async function handleMarkAll(deps: NotificationsRouteDeps): Promise<NotificationHandlerResult> {
  try { return { status: 200, body: await deps.markAllRead() }; }
  catch (err) { return fromApiError(err); }
}
