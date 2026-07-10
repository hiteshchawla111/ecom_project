import { apiClient } from './apiClient';

/** A notification row (mirrors API NotificationView; dates are JSON strings). */
export interface AdminNotification {
  id: string;
  type: string;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
}

interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Unread count for the badge; degrades to 0 so the header never breaks. */
export async function fetchUnreadCount(): Promise<number> {
  try {
    const res = await apiClient.request<{ count: number }>('/notifications/unread-count');
    return res.count ?? 0;
  } catch {
    return 0;
  }
}

/** First page of the caller's visible notifications; degrades to []. */
export async function fetchNotifications(): Promise<AdminNotification[]> {
  try {
    const res = await apiClient.request<Paginated<AdminNotification>>('/notifications?pageSize=10');
    return res.data ?? [];
  } catch {
    return [];
  }
}

/** Mark one notification read (204). */
export function markRead(id: string): Promise<void> {
  return apiClient.request<void>(`/notifications/${id}/read`, { method: 'PATCH' });
}

/** Mark all the caller's visible notifications read. */
export async function markAllRead(): Promise<void> {
  await apiClient.request<{ updated: number }>('/notifications/read-all', { method: 'PATCH' });
}
