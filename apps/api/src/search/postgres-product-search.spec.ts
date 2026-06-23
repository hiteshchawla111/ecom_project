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
    expect(res).toEqual({ data: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('runs the raw query then hydrates via findMany with id IN (...)', async () => {
    const rows: RawRow[] = [{ id: 'b', rank: 0.9, total: 2n }, { id: 'a', rank: 0.3, total: 2n }];
    const { svc, prisma } = build(rows, [{ id: 'a' }, { id: 'b' }]);
    await svc.search('aurora', 1, 20);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    const arg = prisma.product.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: { in: ['b', 'a'] } });
    expect(arg.include).toBeDefined();
  });

  it('re-sorts hydrated products into the rank order from the raw query', async () => {
    const rows: RawRow[] = [{ id: 'b', rank: 0.9, total: 2n }, { id: 'a', rank: 0.3, total: 2n }];
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
    expect(res).toEqual({ data: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
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
});
