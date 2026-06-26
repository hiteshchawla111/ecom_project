import { PostgresProductSearch } from './postgres-product-search';

type RawRow = { id: string; rank: number; total: bigint };

const makePrisma = (rows: RawRow[], products: Array<{ id: string }>) => ({
  $queryRaw: jest.fn().mockResolvedValue(rows),
  product: { findMany: jest.fn().mockResolvedValue(products) },
});

const build = (rows: RawRow[], products: Array<{ id: string }>) => {
  const prisma = makePrisma(rows, products);
  const svc = new PostgresProductSearch(prisma as never);
  return { svc, prisma };
};

describe('PostgresProductSearch', () => {
  it('short-circuits a blank query to an empty page with no DB calls', async () => {
    const { svc, prisma } = build([], []);
    const res = await svc.search('   ', 1, 20);
    expect(res).toEqual({
      data: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 1,
      facets: { brands: [], categories: [], price: null, ratings: [] },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('runs the raw query then hydrates via findMany with id IN (...)', async () => {
    const rows: RawRow[] = [
      { id: 'b', rank: 0.9, total: 2n },
      { id: 'a', rank: 0.3, total: 2n },
    ];
    const { svc, prisma } = build(rows, [{ id: 'a' }, { id: 'b' }]);
    await svc.search('aurora', 1, 20);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(5); // results + 4 facet queries
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    const [findArgs] = prisma.product.findMany.mock.calls as Array<
      [{ where: unknown; include: unknown }]
    >;
    expect(findArgs[0].where).toEqual({ id: { in: ['b', 'a'] } });
    expect(findArgs[0].include).toBeDefined();
  });

  it('re-sorts hydrated products into the rank order from the raw query', async () => {
    const rows: RawRow[] = [
      { id: 'b', rank: 0.9, total: 2n },
      { id: 'a', rank: 0.3, total: 2n },
    ];
    // findMany returns DB order [a, b]; result must follow rank order [b, a].
    const { svc } = build(rows, [{ id: 'a' }, { id: 'b' }]);
    const res = await svc.search('aurora', 1, 20);
    expect(res.data.map((p) => (p as { id: string }).id)).toEqual(['b', 'a']);
    expect(res.total).toBe(2);
    expect(res.totalPages).toBe(1);
  });

  it('returns an empty page (skipping findMany) when the raw query matches nothing', async () => {
    const { svc, prisma } = build([], []);
    const res = await svc.search('zzz', 1, 20);
    expect(res).toEqual({
      data: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 1,
      facets: { brands: [], categories: [], price: null, ratings: [] },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(5); // results + 4 facet queries
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('computes totalPages from the window-function total and pageSize', async () => {
    const rows: RawRow[] = [{ id: 'a', rank: 0.5, total: 25n }];
    const { svc } = build(rows, [{ id: 'a' }]);
    const res = await svc.search('aurora', 1, 10);
    expect(res.total).toBe(25);
    expect(res.totalPages).toBe(3);
  });

  describe('search with facets', () => {
    // Mock issues results-rows first, then brand/category/price/rating facet rows in that order.
    const buildFaceted = (opts: {
      resultRows?: Array<{ id: string; rank: number; total: bigint }>;
      products?: Array<{ id: string }>;
      brands?: Array<{ value: string; count: bigint }>;
      categories?: Array<{ categoryId: string; name: string; count: bigint }>;
      price?: Array<{ min: string | null; max: string | null }>;
      ratings?: Array<{ minRating: number; count: bigint }>;
    }) => {
      const $queryRaw = jest
        .fn()
        .mockResolvedValueOnce(opts.resultRows ?? [])
        .mockResolvedValueOnce(opts.brands ?? [])
        .mockResolvedValueOnce(opts.categories ?? [])
        .mockResolvedValueOnce(opts.price ?? [{ min: null, max: null }])
        .mockResolvedValueOnce(opts.ratings ?? []);
      const prisma = {
        $queryRaw,
        product: { findMany: jest.fn().mockResolvedValue(opts.products ?? []) },
      };
      return { svc: new PostgresProductSearch(prisma as never), prisma };
    };

    it('blank q + no filters → empty page + empty facets, no DB call', async () => {
      const { svc, prisma } = buildFaceted({});
      const res = await svc.search('   ', 1, 20, {});
      expect(res.data).toEqual([]);
      expect(res.total).toBe(0);
      expect(res.facets).toEqual({
        brands: [],
        categories: [],
        price: null,
        ratings: [],
      });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('blank q WITH a filter runs (browse mode) and returns facets', async () => {
      const { svc, prisma } = buildFaceted({
        resultRows: [{ id: 'a', rank: 0, total: 1n }],
        products: [{ id: 'a' }],
        brands: [{ value: 'Acme', count: 1n }],
      });
      const res = await svc.search('', 1, 20, { categoryId: 'cat1' });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(5); // results + 4 facets
      expect(res.facets.brands).toEqual([{ value: 'Acme', count: 1 }]);
    });

    it('assembles all facet buckets and converts bigint counts to Number', async () => {
      const { svc } = buildFaceted({
        resultRows: [{ id: 'a', rank: 0.5, total: 2n }],
        products: [{ id: 'a' }],
        brands: [
          { value: 'Acme', count: 2n },
          { value: 'Beta', count: 3n },
        ],
        categories: [{ categoryId: 'c1', name: 'Phones', count: 5n }],
        price: [{ min: '100.00', max: '900.00' }],
        ratings: [
          { minRating: 4, count: 1n },
          { minRating: 3, count: 2n },
        ],
      });
      const res = await svc.search('phone', 1, 20, {});
      expect(res.facets.brands).toEqual([
        { value: 'Acme', count: 2 },
        { value: 'Beta', count: 3 },
      ]);
      expect(res.facets.categories).toEqual([
        { categoryId: 'c1', name: 'Phones', count: 5 },
      ]);
      expect(res.facets.price).toEqual({ min: '100.00', max: '900.00' });
      expect(res.facets.ratings).toEqual([
        { minRating: 4, count: 1 },
        { minRating: 3, count: 2 },
      ]);
    });

    it('empty price aggregate (no rows match) → price: null', async () => {
      const { svc } = buildFaceted({
        resultRows: [{ id: 'a', rank: 0, total: 1n }],
        products: [{ id: 'a' }],
        price: [{ min: null, max: null }],
      });
      const res = await svc.search('phone', 1, 20, {});
      expect(res.facets.price).toBeNull();
    });
  });

  describe('suggest', () => {
    type SuggestRow = {
      id: string;
      name: string;
      price: string;
      salePrice: string | null;
      rank: number;
    };

    const buildSuggest = (rows: SuggestRow[]) => {
      const prisma = {
        $queryRaw: jest.fn().mockResolvedValue(rows),
        product: { findMany: jest.fn() },
      };
      const svc = new PostgresProductSearch(prisma as never);
      return { svc, prisma };
    };

    it('short-circuits a blank query to [] with no DB call', async () => {
      const { svc, prisma } = buildSuggest([]);
      const res = await svc.suggest('   ', 8);
      expect(res).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('short-circuits a tokenless query (e.g. "!!!") to [] with no DB call', async () => {
      const { svc, prisma } = buildSuggest([]);
      const res = await svc.suggest('!!!', 8);
      expect(res).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('queries and maps rows to lean suggestions, preserving null salePrice', async () => {
      const rows: SuggestRow[] = [
        {
          id: 'a',
          name: 'Aurora X',
          price: '799.00',
          salePrice: '699.00',
          rank: 0.9,
        },
        {
          id: 'b',
          name: 'Aurora Lite',
          price: '399.00',
          salePrice: null,
          rank: 0.5,
        },
      ];
      const { svc, prisma } = buildSuggest(rows);
      const res = await svc.suggest('auro', 8);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(res).toEqual([
        { id: 'a', name: 'Aurora X', price: '799.00', salePrice: '699.00' },
        { id: 'b', name: 'Aurora Lite', price: '399.00', salePrice: null },
      ]);
    });
  });
});
