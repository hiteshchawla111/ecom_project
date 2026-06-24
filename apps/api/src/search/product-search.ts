import { Prisma } from '@prisma/client';

/** Relations included so a search hit renders identically to a catalog card. */
export const PRODUCT_SEARCH_INCLUDE = {
  category: true,
  images: { orderBy: { position: 'asc' as const } },
  seller: { select: { displayName: true, slug: true } },
} satisfies Prisma.ProductInclude;

/** A search result row: a Product plus the included relations. */
export type ProductSearchItem = Prisma.ProductGetPayload<{
  include: typeof PRODUCT_SEARCH_INCLUDE;
}>;

/** Paginated search envelope — a Product plus its catalog-card relations. */
export interface ProductSearchResult {
  data: ProductSearchItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Swappable product-search seam (ADR-009). The default binding is the
 * Postgres GIN FTS impl (ADR-011); an Elasticsearch adapter can be bound by
 * env later without touching the controller. Callers receive a fully
 * paginated, ranked, ACTIVE-only result.
 */
export interface ProductSearch {
  search(
    q: string,
    page: number,
    pageSize: number,
  ): Promise<ProductSearchResult>;
}

/** DI token for `ProductSearch` (interfaces have no runtime identity in TS). */
export const PRODUCT_SEARCH = Symbol('ProductSearch');
