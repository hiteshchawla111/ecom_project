/**
 * Browser-safe fetch wrapper for the same-origin /api/notifications* routes.
 * Deliberately does NOT import 'server-only' — this module is imported by the
 * client-side NotificationBell island. Reads degrade gracefully (0 / []) on
 * failure so a broken notifications feature never breaks the rest of the page;
 * writes (mark read/all) propagate errors to the caller.
 */

export interface NotificationView {
  id: string;
  type: string;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
}

export async function fetchUnreadCount(): Promise<number> {
  try {
    const res = await fetch('/api/notifications/unread-count');
    if (!res.ok) return 0;
    const body = (await res.json()) as { count?: number };
    return body.count ?? 0;
  } catch {
    return 0;
  }
}

export async function fetchNotifications(): Promise<NotificationView[]> {
  try {
    const res = await fetch('/api/notifications?pageSize=10');
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: NotificationView[] };
    return body.data ?? [];
  } catch {
    return [];
  }
}

export async function postMarkRead(id: string): Promise<void> {
  await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
}

export async function postMarkAll(): Promise<void> {
  await fetch('/api/notifications/read-all', { method: 'PATCH' });
}
