import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('./api-authed', () => ({ authedRequest: vi.fn() }));
import { authedRequest } from './api-authed';
import { listNotifications, getUnreadCount, markRead, markAllRead } from './notifications';

const req = authedRequest as unknown as ReturnType<typeof vi.fn>;
const deps = {} as never;

describe('notifications client', () => {
  beforeEach(() => req.mockReset());
  it('listNotifications builds query + GET', async () => {
    req.mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0, totalPages: 1 });
    await listNotifications({ page: 1, pageSize: 10 }, deps);
    expect(req).toHaveBeenCalledWith('/notifications?page=1&pageSize=10', { method: 'GET' }, deps);
  });
  it('getUnreadCount GETs the count route', async () => {
    req.mockResolvedValue({ count: 3 });
    await getUnreadCount(deps);
    expect(req).toHaveBeenCalledWith('/notifications/unread-count', { method: 'GET' }, deps);
  });
  it('markRead PATCHes the id route', async () => {
    req.mockResolvedValue(undefined);
    await markRead('n1', deps);
    expect(req).toHaveBeenCalledWith('/notifications/n1/read', { method: 'PATCH' }, deps);
  });
  it('markAllRead PATCHes read-all', async () => {
    req.mockResolvedValue({ updated: 2 });
    await markAllRead(deps);
    expect(req).toHaveBeenCalledWith('/notifications/read-all', { method: 'PATCH' }, deps);
  });
});
