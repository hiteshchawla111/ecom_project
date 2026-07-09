import { describe, it, expect, vi } from 'vitest';
import { ApiAuthError } from '@/lib/api-auth';
import { handleList, handleUnreadCount, handleMarkRead, handleMarkAll, type NotificationsRouteDeps } from './handlers';

function deps(over: Partial<NotificationsRouteDeps> = {}): NotificationsRouteDeps {
  return {
    list: vi.fn().mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0, totalPages: 1 }),
    unreadCount: vi.fn().mockResolvedValue({ count: 0 }),
    markRead: vi.fn().mockResolvedValue(undefined),
    markAllRead: vi.fn().mockResolvedValue({ updated: 0 }),
    ...over,
  };
}

describe('notification handlers', () => {
  it('handleList returns 200 + body', async () => {
    expect(await handleList({}, deps())).toEqual({ status: 200, body: expect.objectContaining({ data: [] }) });
  });
  it('handleMarkRead returns 204', async () => {
    expect(await handleMarkRead('n1', deps())).toEqual({ status: 204, body: null });
  });
  it('maps ApiAuthError to its status', async () => {
    const d = deps({ unreadCount: vi.fn().mockRejectedValue(new ApiAuthError('nope', 401)) });
    expect(await handleUnreadCount(d)).toEqual({ status: 401, body: { message: 'nope' } });
  });
  it('handleMarkAll returns the updated count', async () => {
    const d = deps({ markAllRead: vi.fn().mockResolvedValue({ updated: 4 }) });
    expect(await handleMarkAll(d)).toEqual({ status: 200, body: { updated: 4 } });
  });
});
