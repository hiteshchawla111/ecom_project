import { Prisma } from '@prisma/client';
import { buildSearchWhere, SearchFilters } from './search-filters';

// Join the SQL literal chunks to inspect which clauses are present (params are $N placeholders).
const sqlText = (frag: Prisma.Sql): string => frag.strings.join('?');

describe('buildSearchWhere', () => {
  it('base only: active + not-deleted, no text predicate for blank q, no filters', () => {
    const f = buildSearchWhere('   ', {});
    const t = sqlText(f);
    expect(t).toContain('"deletedAt" IS NULL');
    expect(t).toContain("status = 'ACTIVE'");
    expect(t).not.toContain('to_tsquery');
    expect(f.values).toEqual([]);
  });

  it('adds the text predicate when q is non-blank (q is a bound param)', () => {
    const f = buildSearchWhere('phone', {});
    expect(sqlText(f)).toContain('websearch_to_tsquery');
    expect(f.values).toContain('phone');
  });

  it('applies all filters when omit is undefined (each value bound)', () => {
    const filters: SearchFilters = {
      brand: 'Acme',
      categoryId: 'cat1',
      minPrice: 100,
      maxPrice: 500,
      minRating: 4,
    };
    const f = buildSearchWhere('', filters);
    const t = sqlText(f);
    expect(t).toContain('p.brand =');
    expect(t).toContain('p."categoryId" =');
    expect(t).toContain('p.price >=');
    expect(t).toContain('p.price <=');
    expect(t).toContain('p."ratingAvg" >=');
    expect(f.values).toEqual(
      expect.arrayContaining(['Acme', 'cat1', 100, 500, 4]),
    );
  });

  it("omit='brand' drops the brand clause but keeps category/price/rating", () => {
    const filters: SearchFilters = {
      brand: 'Acme',
      categoryId: 'cat1',
      minPrice: 100,
      minRating: 4,
    };
    const t = sqlText(buildSearchWhere('', filters, 'brand'));
    expect(t).not.toContain('p.brand =');
    expect(t).toContain('p."categoryId" =');
    expect(t).toContain('p.price >=');
    expect(t).toContain('p."ratingAvg" >=');
  });

  it("omit='price' drops BOTH min and max price clauses", () => {
    const filters: SearchFilters = {
      brand: 'Acme',
      minPrice: 100,
      maxPrice: 500,
    };
    const t = sqlText(buildSearchWhere('', filters, 'price'));
    expect(t).not.toContain('p.price >=');
    expect(t).not.toContain('p.price <=');
    expect(t).toContain('p.brand =');
  });

  it("omit='category' drops category; omit='rating' drops rating", () => {
    const filters: SearchFilters = { categoryId: 'cat1', minRating: 4 };
    expect(sqlText(buildSearchWhere('', filters, 'category'))).not.toContain(
      'p."categoryId" =',
    );
    expect(sqlText(buildSearchWhere('', filters, 'rating'))).not.toContain(
      'p."ratingAvg" >=',
    );
  });
});
