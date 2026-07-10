import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('./apiClient', () => ({ apiClient: { request: vi.fn() } }));
import { apiClient } from './apiClient';
import { fetchUnreadCount, fetchNotifications, markRead, markAllRead } from './notifications';

const req = apiClient.request as unknown as ReturnType<typeof vi.fn>;

describe('admin notifications client', () => {
  beforeEach(() => req.mockReset());

  it('fetchUnreadCount returns the count', async () => {
    req.mockResolvedValue({ count: 4 });
    expect(await fetchUnreadCount()).toBe(4);
    expect(req).toHaveBeenCalledWith('/notifications/unread-count');
  });
  it('fetchUnreadCount degrades to 0 on error', async () => {
    req.mockRejectedValueOnce(new Error('boom'));
    expect(await fetchUnreadCount()).toBe(0);
  });
  it('fetchNotifications returns the first page data', async () => {
    req.mockResolvedValue({ data: [{ id: 'n1', type: 'NEW_ORDER', payload: {}, readAt: null, createdAt: 'x' }], page: 1, pageSize: 10, total: 1, totalPages: 1 });
    const items = await fetchNotifications();
    expect(items).toHaveLength(1);
    expect(req).toHaveBeenCalledWith('/notifications?pageSize=10');
  });
  it('fetchNotifications degrades to [] on error', async () => {
    req.mockRejectedValueOnce(new Error('boom'));
    expect(await fetchNotifications()).toEqual([]);
  });
  it('markRead PATCHes the id route', async () => {
    req.mockResolvedValue(undefined);
    await markRead('n1');
    expect(req).toHaveBeenCalledWith('/notifications/n1/read', { method: 'PATCH' });
  });
  it('markAllRead PATCHes read-all', async () => {
    req.mockResolvedValue({ updated: 3 });
    await markAllRead();
    expect(req).toHaveBeenCalledWith('/notifications/read-all', { method: 'PATCH' });
  });
});
