import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from './apiClient';
import { listSellerProducts } from './sellerProducts';

vi.mock('./apiClient', () => ({
  apiClient: { request: vi.fn() },
}));

describe('listSellerProducts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GETs /seller/products with pagination params', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [], page: 1, pageSize: 20, total: 0, totalPages: 1,
    });
    await listSellerProducts({ page: 2, pageSize: 10 });
    expect(apiClient.request).toHaveBeenCalledWith('/seller/products?page=2&pageSize=10');
  });

  it('GETs /seller/products with no query string when no params', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [], page: 1, pageSize: 20, total: 0, totalPages: 1,
    });
    await listSellerProducts();
    expect(apiClient.request).toHaveBeenCalledWith('/seller/products');
  });
});
