import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from './apiClient';
import { fetchSubOrders, updateSubOrderStatus } from './sellerSubOrders';

vi.mock('./apiClient', () => ({ apiClient: { request: vi.fn() } }));
const req = () => apiClient.request as ReturnType<typeof vi.fn>;

describe('fetchSubOrders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GETs /seller/suborders with cursor/limit/status, omitting undefined', async () => {
    req().mockResolvedValue({ data: [], nextCursor: null });
    await fetchSubOrders({ cursor: 'c1', limit: 20, status: 'PENDING' });
    expect(apiClient.request).toHaveBeenCalledWith(
      '/seller/suborders?cursor=c1&limit=20&status=PENDING',
    );
  });

  it('GETs /seller/suborders with no query string when no params', async () => {
    req().mockResolvedValue({ data: [], nextCursor: null });
    await fetchSubOrders({});
    expect(apiClient.request).toHaveBeenCalledWith('/seller/suborders');
  });

  it('returns the {data, nextCursor} page', async () => {
    const pageData = { data: [{ id: 's1' }], nextCursor: '2026-07-01T00:00:00.000Z_s1' };
    req().mockResolvedValue(pageData);
    await expect(fetchSubOrders({ limit: 20 })).resolves.toEqual(pageData);
  });
});

describe('updateSubOrderStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('PATCHes /seller/suborders/:id/status with the status body', async () => {
    req().mockResolvedValue({ id: 's1', status: 'CONFIRMED' });
    await updateSubOrderStatus('s1', 'CONFIRMED');
    expect(apiClient.request).toHaveBeenCalledWith('/seller/suborders/s1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'CONFIRMED' }),
    });
  });
});
