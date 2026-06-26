import { describe, expect, it, vi } from 'vitest';
import {
  CatalogError,
  getCategory,
  getProduct,
  getRelatedProducts,
  getSeller,
  listCategories,
  listProducts,
  listSellerProducts,
  searchProducts,
  type Category,
  type Product,
  type Seller,
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
  seller: { displayName: 'Aurora Store', slug: 'aurora-store' },
  ratingAvg: '4.50',
  ratingCount: 12,
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

  it('includes categoryId in the query when provided', async () => {
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

    await listProducts({ categoryId: 'c1' }, { ...opts, fetch: fetchMock });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('categoryId=c1');
  });

  it('includes search, price range and sort params when provided', async () => {
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

    await listProducts(
      {
        search: 'phone',
        minPrice: 100,
        maxPrice: 900,
        sortBy: 'price',
        sortDir: 'asc',
      },
      { ...opts, fetch: fetchMock },
    );

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('search=phone');
    expect(url).toContain('minPrice=100');
    expect(url).toContain('maxPrice=900');
    expect(url).toContain('sortBy=price');
    expect(url).toContain('sortDir=asc');
  });

  it('includes status in the query when provided', async () => {
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

    await listProducts({ status: 'ACTIVE' }, { ...opts, fetch: fetchMock });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('status=ACTIVE');
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

const sampleCategory: Category = {
  id: 'c1',
  name: 'Phones',
  slug: 'phones',
  parentId: 'root',
  parent: null,
  children: [],
};

describe('listCategories', () => {
  it('requests /categories and returns the tree', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, [sampleCategory]));

    const res = await listCategories({ ...opts, fetch: fetchMock });

    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/categories');
    expect(res).toHaveLength(1);
    expect(res[0].slug).toBe('phones');
  });

  it('throws CatalogError on a non-ok response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { message: 'boom' }));

    await expect(
      listCategories({ ...opts, fetch: fetchMock }),
    ).rejects.toBeInstanceOf(CatalogError);
  });
});

describe('getCategory', () => {
  it('requests /categories/:idOrSlug and returns the category', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, sampleCategory));

    const res = await getCategory('phones', { ...opts, fetch: fetchMock });

    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/categories/phones');
    expect(res?.slug).toBe('phones');
  });

  it('returns null on a 404', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(404, { message: 'Category not found' }));

    await expect(
      getCategory('nope', { ...opts, fetch: fetchMock }),
    ).resolves.toBeNull();
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

  it('round-trips the seller field on the product detail response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, sampleProduct));

    const res = await getProduct('p1', { ...opts, fetch: fetchMock });

    expect(res?.seller).toEqual({
      displayName: 'Aurora Store',
      slug: 'aurora-store',
    });
  });

  it('round-trips the rating fields on the product detail response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, sampleProduct));

    const res = await getProduct('p1', { ...opts, fetch: fetchMock });

    expect(res?.ratingAvg).toBe('4.50');
    expect(res?.ratingCount).toBe(12);
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

describe('getRelatedProducts', () => {
  const inCategory = (ids: string[]) =>
    jsonResponse(200, {
      data: ids.map((id) => ({ ...sampleProduct, id })),
      page: 1,
      pageSize: 5,
      total: ids.length,
      totalPages: 1,
    });

  it('fetches ACTIVE products in the same category', async () => {
    const fetchMock = vi.fn().mockResolvedValue(inCategory(['p2', 'p3']));

    await getRelatedProducts('c1', 'p1', { ...opts, fetch: fetchMock });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('categoryId=c1');
    expect(url).toContain('status=ACTIVE');
  });

  it('excludes the current product from the results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(inCategory(['p1', 'p2', 'p3']));

    const res = await getRelatedProducts('c1', 'p1', {
      ...opts,
      fetch: fetchMock,
    });

    expect(res.map((p) => p.id)).toEqual(['p2', 'p3']);
  });

  it('caps the result at 4 products', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(inCategory(['p2', 'p3', 'p4', 'p5', 'p6']));

    const res = await getRelatedProducts('c1', 'p1', {
      ...opts,
      fetch: fetchMock,
    });

    expect(res).toHaveLength(4);
  });

  it('returns an empty array when there are no other products', async () => {
    const fetchMock = vi.fn().mockResolvedValue(inCategory(['p1']));

    const res = await getRelatedProducts('c1', 'p1', {
      ...opts,
      fetch: fetchMock,
    });

    expect(res).toEqual([]);
  });
});

const sampleSeller: Seller = {
  id: 's1',
  displayName: 'Demo Shop',
  slug: 'demo-shop',
  description: 'We sell demo things',
  logoUrl: null,
};

describe('getSeller', () => {
  it('requests /sellers/:slug and returns the seller', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, sampleSeller));

    const res = await getSeller('demo-shop', { ...opts, fetch: fetchMock });

    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/sellers/demo-shop');
    expect(res?.slug).toBe('demo-shop');
    expect(res?.displayName).toBe('Demo Shop');
  });

  it('returns null on a 404', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(404, { message: 'Seller not found' }));

    await expect(
      getSeller('nope', { ...opts, fetch: fetchMock }),
    ).resolves.toBeNull();
  });

  it('throws CatalogError on a non-404 error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { message: 'boom' }));

    await expect(
      getSeller('demo-shop', { ...opts, fetch: fetchMock }),
    ).rejects.toBeInstanceOf(CatalogError);
  });
});

describe('listSellerProducts', () => {
  it('requests /sellers/:slug/products with pagination params and returns the envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: [sampleProduct],
        page: 2,
        pageSize: 12,
        total: 13,
        totalPages: 2,
      }),
    );

    const res = await listSellerProducts(
      'demo-shop',
      { page: 2, pageSize: 12 },
      { ...opts, fetch: fetchMock },
    );

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('http://api.test/sellers/demo-shop/products');
    expect(url).toContain('page=2');
    expect(url).toContain('pageSize=12');
    expect(res.data).toHaveLength(1);
    expect(res.total).toBe(13);
  });

  it('omits undefined pagination params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: [],
        page: 1,
        pageSize: 12,
        total: 0,
        totalPages: 1,
      }),
    );

    await listSellerProducts('demo-shop', {}, { ...opts, fetch: fetchMock });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe('http://api.test/sellers/demo-shop/products');
  });
});

describe('searchProducts', () => {
  const sampleResult = {
    data: [],
    page: 1,
    pageSize: 12,
    total: 0,
    totalPages: 1,
    facets: {
      brands: [{ value: 'Acme', count: 3 }],
      categories: [{ categoryId: 'c1', name: 'Phones', count: 5 }],
      price: { min: '100.00', max: '900.00' },
      ratings: [{ minRating: 4, count: 2 }],
    },
  };

  it('builds the /products/search URL with q + facet params', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, sampleResult));

    await searchProducts(
      { q: 'phone', page: 2, pageSize: 12, brand: 'Acme', categoryId: 'c1', minPrice: 100, maxPrice: 900, minRating: 4 },
      { ...opts, fetch: fetchMock },
    );

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('http://api.test/products/search?');
    expect(url).toContain('q=phone');
    expect(url).toContain('brand=Acme');
    expect(url).toContain('categoryId=c1');
    expect(url).toContain('minPrice=100');
    expect(url).toContain('maxPrice=900');
    expect(url).toContain('minRating=4');
    expect(url).toContain('page=2');
  });

  it('returns the parsed SearchResult including facets', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, sampleResult));

    const result = await searchProducts(
      { q: 'phone' },
      { ...opts, fetch: fetchMock },
    );

    expect(result.facets.brands).toEqual([{ value: 'Acme', count: 3 }]);
    expect(result.facets.price).toEqual({ min: '100.00', max: '900.00' });
    expect(result.total).toBe(0);
  });

  it('throws CatalogError on a non-2xx response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(400, { message: 'bad' }));

    await expect(
      searchProducts(
        { q: 'x' },
        { ...opts, fetch: fetchMock },
      ),
    ).rejects.toBeInstanceOf(CatalogError);
  });
});
