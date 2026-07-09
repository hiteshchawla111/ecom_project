import 'server-only';
import { authedRequest, type AuthedApiDeps } from './api-authed';

export type { AuthedApiDeps } from './api-authed';

export interface NotificationView {
  id: string;
  type: string;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
}
export interface NotificationPage {
  data: NotificationView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export interface ListNotificationsQuery {
  page?: number;
  pageSize?: number;
  unread?: boolean;
}

function toQuery(q: ListNotificationsQuery): string {
  const p = new URLSearchParams();
  if (q.page !== undefined) p.set('page', String(q.page));
  if (q.pageSize !== undefined) p.set('pageSize', String(q.pageSize));
  if (q.unread !== undefined) p.set('unread', String(q.unread));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function listNotifications(query: ListNotificationsQuery, deps: AuthedApiDeps): Promise<NotificationPage> {
  return authedRequest<NotificationPage>(`/notifications${toQuery(query)}`, { method: 'GET' }, deps);
}
export function getUnreadCount(deps: AuthedApiDeps): Promise<{ count: number }> {
  return authedRequest<{ count: number }>(`/notifications/unread-count`, { method: 'GET' }, deps);
}
export function markRead(id: string, deps: AuthedApiDeps): Promise<void> {
  return authedRequest<void>(`/notifications/${id}/read`, { method: 'PATCH' }, deps);
}
export function markAllRead(deps: AuthedApiDeps): Promise<{ updated: number }> {
  return authedRequest<{ updated: number }>(`/notifications/read-all`, { method: 'PATCH' }, deps);
}
