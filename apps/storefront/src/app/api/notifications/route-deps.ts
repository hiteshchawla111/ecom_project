import 'server-only';
import { liveAuthedDeps } from '@/lib/api-authed';
import { listNotifications, getUnreadCount, markRead, markAllRead } from '@/lib/notifications';
import type { NotificationsRouteDeps } from './handlers';

export function liveNotificationsRouteDeps(): NotificationsRouteDeps {
  return {
    list: async (query) => listNotifications(query, await liveAuthedDeps()),
    unreadCount: async () => getUnreadCount(await liveAuthedDeps()),
    markRead: async (id) => markRead(id, await liveAuthedDeps()),
    markAllRead: async () => markAllRead(await liveAuthedDeps()),
  };
}
