import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchUnreadCount, fetchNotifications, postMarkRead, postMarkAll } from './notifications-client';

function mockFetchOnce(ok: boolean, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('notifications-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('fetchUnreadCount', () => {
    it('parses count from an ok response', async () => {
      const fetchMock = mockFetchOnce(true, { count: 3 });
      await expect(fetchUnreadCount()).resolves.toBe(3);
      expect(fetchMock).toHaveBeenCalledWith('/api/notifications/unread-count');
    });

    it('degrades to 0 when count is missing', async () => {
      mockFetchOnce(true, {});
      await expect(fetchUnreadCount()).resolves.toBe(0);
    });

    it('degrades to 0 on a non-ok response', async () => {
      mockFetchOnce(false, {});
      await expect(fetchUnreadCount()).resolves.toBe(0);
    });

    it('degrades to 0 when fetch throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
      await expect(fetchUnreadCount()).resolves.toBe(0);
    });
  });

  describe('fetchNotifications', () => {
    it('parses data from an ok response and requests pageSize=10', async () => {
      const items = [{ id: 'n1', type: 'SHIPPING_UPDATE', payload: {}, readAt: null, createdAt: '2026-01-01T00:00:00.000Z' }];
      const fetchMock = mockFetchOnce(true, { data: items });
      await expect(fetchNotifications()).resolves.toEqual(items);
      expect(fetchMock).toHaveBeenCalledWith('/api/notifications?pageSize=10');
    });

    it('degrades to [] when data is missing', async () => {
      mockFetchOnce(true, {});
      await expect(fetchNotifications()).resolves.toEqual([]);
    });

    it('degrades to [] on a non-ok response', async () => {
      mockFetchOnce(false, {});
      await expect(fetchNotifications()).resolves.toEqual([]);
    });

    it('degrades to [] when fetch throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
      await expect(fetchNotifications()).resolves.toEqual([]);
    });
  });

  describe('postMarkRead', () => {
    it('PATCHes the mark-read path for the given id', async () => {
      const fetchMock = mockFetchOnce(true, {});
      await postMarkRead('n1');
      expect(fetchMock).toHaveBeenCalledWith('/api/notifications/n1/read', { method: 'PATCH' });
    });
  });

  describe('postMarkAll', () => {
    it('PATCHes the mark-all-read path', async () => {
      const fetchMock = mockFetchOnce(true, {});
      await postMarkAll();
      expect(fetchMock).toHaveBeenCalledWith('/api/notifications/read-all', { method: 'PATCH' });
    });
  });
});
