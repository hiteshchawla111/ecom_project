import { describe, expect, it, vi } from 'vitest';
import {
  CatalogError,
  getProduct,
  listProducts,
  type Product,
} from './catalog';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const opts = { baseUrl: 'http://api.test' };

const sampleProduct: Product = {
  id: 'p1',
  name: 'Aurora Phone',
  sku: 'PH-001',
  description: 'A phone',
  price: '799',
  salePrice: '699',
  brand: 'Aurora',
  status: 'ACTIVE',
  categoryId: 'c1',
  images: [],
};

describe('listProducts', () => {
  it('requests /products with pagination query params', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, {
          data: [sampleProduct],
          page: 2,
          pageSize: 12,
          total: 13,
          totalPages: 2,
        }),
      );

    const res = await listProducts(
      { page: 2, pageSize: 12 },
      { ...opts, fetch: fetchMock },
    );

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('http://api.test/products');
    expect(url).toContain('page=2');
    expect(url).toContain('pageSize=12');
    expect(res.data).toHaveLength(1);
    expect(res.total).toBe(13);
  });

  it('omits undefined query params', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, {
          data: [],
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 1,
        }),
      );

    await listProducts({}, { ...opts, fetch: fetchMock });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).not.toContain('page=');
    expect(url).not.toContain('undefined');
  });

  it('throws CatalogError on a non-ok response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { message: 'boom' }));

    await expect(
      listProducts({}, { ...opts, fetch: fetchMock }),
    ).rejects.toBeInstanceOf(CatalogError);
  });
});

describe('getProduct', () => {
  it('requests /products/:id and returns the product', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, sampleProduct));

    const res = await getProduct('p1', { ...opts, fetch: fetchMock });

    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/products/p1');
    expect(res?.id).toBe('p1');
  });

  it('returns null on a 404', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(404, { message: 'Product not found' }));

    await expect(
      getProduct('nope', { ...opts, fetch: fetchMock }),
    ).resolves.toBeNull();
  });

  it('throws CatalogError on a non-404 error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { message: 'boom' }));

    await expect(
      getProduct('p1', { ...opts, fetch: fetchMock }),
    ).rejects.toBeInstanceOf(CatalogError);
  });
});
