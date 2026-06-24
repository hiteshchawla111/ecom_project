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
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
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
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('computes totalPages from the window-function total and pageSize', async () => {
    const rows: RawRow[] = [{ id: 'a', rank: 0.5, total: 25n }];
    const { svc } = build(rows, [{ id: 'a' }]);
    const res = await svc.search('aurora', 1, 10);
    expect(res.total).toBe(25);
    expect(res.totalPages).toBe(3);
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
