import type { Product } from '@prisma/client';

/** Paginated search envelope — same shape as the catalog list `Paginated<Product>`. */
export interface ProductSearchResult {
  data: Product[];
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
  search(q: string, page: number, pageSize: number): Promise<ProductSearchResult>;
}

/** DI token for `ProductSearch` (interfaces have no runtime identity in TS). */
export const PRODUCT_SEARCH = Symbol('ProductSearch');
