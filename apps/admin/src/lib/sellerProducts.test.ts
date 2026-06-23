import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from './apiClient';
import {
  listSellerProducts,
  getSellerProduct,
  createSellerProduct,
  updateSellerProduct,
  archiveSellerProduct,
  setSellerProductActive,
  importSellerProducts,
} from './sellerProducts';

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

describe('importSellerProducts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POSTs a FormData (field "file") to /seller/products/import', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      created: 2, failed: 0, productIds: ['a', 'b'], errors: [],
    });
    const file = new File(['name,sku\nX,X1'], 'p.csv', { type: 'text/csv' });

    const res = await importSellerProducts(file);

    expect(apiClient.request).toHaveBeenCalledTimes(1);
    const [path, init] = (apiClient.request as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toBe('/seller/products/import');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
    expect(((init as RequestInit).body as FormData).get('file')).toBe(file);
    expect(res.created).toBe(2);
  });
});

describe('seller product mutations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getSellerProduct GETs /seller/products/:id', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });
    await getSellerProduct('p1');
    expect(apiClient.request).toHaveBeenCalledWith('/seller/products/p1');
  });

  it('createSellerProduct POSTs /seller/products with a pruned body', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });
    await createSellerProduct({
      name: 'X', sku: 'X1', description: 'd', price: 5, categoryId: 'c1',
    });
    expect(apiClient.request).toHaveBeenCalledWith('/seller/products', {
      method: 'POST',
      body: JSON.stringify({ name: 'X', sku: 'X1', description: 'd', price: 5, categoryId: 'c1' }),
    });
  });

  it('updateSellerProduct PATCHes /seller/products/:id', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });
    await updateSellerProduct('p1', {
      name: 'X', description: 'd', price: 5, categoryId: 'c1',
    });
    expect(apiClient.request).toHaveBeenCalledWith('/seller/products/p1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'X', description: 'd', price: 5, categoryId: 'c1' }),
    });
  });

  it('archiveSellerProduct POSTs /seller/products/:id/archive', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });
    await archiveSellerProduct('p1');
    expect(apiClient.request).toHaveBeenCalledWith('/seller/products/p1/archive', { method: 'POST' });
  });

  it('setSellerProductActive PATCHes /seller/products/:id/active with {active}', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });
    await setSellerProductActive('p1', false);
    expect(apiClient.request).toHaveBeenCalledWith('/seller/products/p1/active', {
      method: 'PATCH',
      body: JSON.stringify({ active: false }),
    });
  });
});
