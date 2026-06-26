import { Prisma } from '@prisma/client';

/** Single-value facet filters applied to a product search. */
export interface SearchFilters {
  brand?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
}

/** Which facet a count query is computing — used to omit that facet's own filter (disjunctive). */
export type FacetKey = 'brand' | 'category' | 'price' | 'rating';

/**
 * Build the parameterized WHERE fragment (incl. the leading `WHERE`) shared by the
 * results query and the facet-count queries. Every value is a bound param via
 * `Prisma.sql` interpolation (no injection). `omit` drops one facet's own filter so
 * that facet's counts stay disjunctive (show alternatives). Blank `q` adds no text
 * predicate (browse mode). The `@@` expression matches the K2 GIN index.
 */
export function buildSearchWhere(
  q: string,
  filters: SearchFilters,
  omit?: FacetKey,
): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`p."deletedAt" IS NULL`,
    Prisma.sql`p.status = 'ACTIVE'`,
  ];

  const term = q.trim();
  if (term !== '') {
    clauses.push(
      Prisma.sql`to_tsvector('english', p.name || ' ' || coalesce(p.description, '')) @@ websearch_to_tsquery('english', ${term})`,
    );
  }

  if (omit !== 'brand' && filters.brand !== undefined) {
    clauses.push(Prisma.sql`p.brand = ${filters.brand}`);
  }
  if (omit !== 'category' && filters.categoryId !== undefined) {
    clauses.push(Prisma.sql`p."categoryId" = ${filters.categoryId}`);
  }
  if (omit !== 'price' && filters.minPrice !== undefined) {
    clauses.push(Prisma.sql`p.price >= ${filters.minPrice}`);
  }
  if (omit !== 'price' && filters.maxPrice !== undefined) {
    clauses.push(Prisma.sql`p.price <= ${filters.maxPrice}`);
  }
  if (omit !== 'rating' && filters.minRating !== undefined) {
    clauses.push(Prisma.sql`p."ratingAvg" >= ${filters.minRating}`);
  }

  return Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`;
}
