import { Prisma } from '@prisma/client';
import { PRODUCT_INCLUDE } from '../products/products.service';

/**
 * Search hits render identically to catalog cards — reuse the catalog's
 * single include definition (one source of truth; cannot drift).
 */
export const PRODUCT_SEARCH_INCLUDE = PRODUCT_INCLUDE;

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

/** A lean autocomplete row — enough to render a dropdown entry and link by id. */
export interface ProductSuggestion {
  id: string;
  name: string;
  price: string;
  salePrice: string | null;
}

/**
 * Swappable product-search seam (ADR-009). The default binding is the
 * Postgres GIN FTS impl (ADR-011); an Elasticsearch adapter can be bound by
 * env later without touching the controller.
 */
export interface ProductSearch {
  search(
    q: string,
    page: number,
    pageSize: number,
  ): Promise<ProductSearchResult>;

  /** Ranked, ACTIVE-only, prefix-matched autocomplete suggestions (capped at `limit`). */
  suggest(q: string, limit: number): Promise<ProductSuggestion[]>;
}

/** DI token for `ProductSearch` (interfaces have no runtime identity in TS). */
export const PRODUCT_SEARCH = Symbol('ProductSearch');
