import { describe, it, expect, beforeEach, vi } from 'vitest';

const request = vi.fn();
vi.mock('./apiClient', () => ({
  apiClient: { request: (...a: unknown[]) => request(...a) },
}));

import { listSellers, getSeller, updateSellerStatus } from './sellers';

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

describe('listSellers', () => {
  it('GETs /admin/sellers with no query when called with defaults', async () => {
    await listSellers();
    expect(request).toHaveBeenCalledWith('/admin/sellers');
  });

  it('includes page and status in the query string', async () => {
    await listSellers({ page: 2, status: 'PENDING_REVIEW' });
    expect(request).toHaveBeenCalledWith(
      '/admin/sellers?page=2&status=PENDING_REVIEW',
    );
  });

  it('omits undefined params when only page is provided', async () => {
    await listSellers({ page: 3 });
    expect(request).toHaveBeenCalledWith('/admin/sellers?page=3');
  });

  it('includes page, pageSize, and status when all are provided', async () => {
    await listSellers({ page: 1, pageSize: 10, status: 'ACTIVE' });
    expect(request).toHaveBeenCalledWith(
      '/admin/sellers?page=1&pageSize=10&status=ACTIVE',
    );
  });
});

describe('getSeller', () => {
  it('GETs /admin/sellers/:id', async () => {
    request.mockResolvedValue({ id: 's1' });
    await getSeller('s1');
    expect(request).toHaveBeenCalledWith('/admin/sellers/s1');
  });
});

describe('updateSellerStatus', () => {
  it('PATCHes /admin/sellers/:id/status with status only when no reason given', async () => {
    request.mockResolvedValue({ id: 's1', status: 'ACTIVE' });
    await updateSellerStatus('s1', 'ACTIVE');
    expect(request).toHaveBeenCalledWith('/admin/sellers/s1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
  });

  it('PATCHes with status and reason when reason is provided', async () => {
    request.mockResolvedValue({ id: 's1', status: 'SUSPENDED' });
    await updateSellerStatus('s1', 'SUSPENDED', 'bad docs');
    expect(request).toHaveBeenCalledWith('/admin/sellers/s1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'SUSPENDED', reason: 'bad docs' }),
    });
  });
});
