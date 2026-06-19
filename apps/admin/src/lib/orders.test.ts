import { describe, it, expect, beforeEach, vi } from 'vitest';

const request = vi.fn();
vi.mock('./apiClient', () => ({
  apiClient: { request: (...a: unknown[]) => request(...a) },
}));

import { listOrders } from './orders';

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({
    data: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
});

describe('listOrders', () => {
  it('GETs /admin/orders with no query when called with defaults', async () => {
    await listOrders({});
    expect(request).toHaveBeenCalledWith('/admin/orders');
  });

  it('includes page, pageSize, and status in the query string', async () => {
    await listOrders({ page: 2, pageSize: 20, status: 'SHIPPED' });
    expect(request).toHaveBeenCalledWith(
      '/admin/orders?page=2&pageSize=20&status=SHIPPED',
    );
  });

  it('omits status when not provided', async () => {
    await listOrders({ page: 3 });
    expect(request).toHaveBeenCalledWith('/admin/orders?page=3');
  });
});
