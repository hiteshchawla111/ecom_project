import 'server-only';
import { apiBaseUrl } from './env';

/**
 * Typed, server-side client for the public catalog endpoints (`apps/api`
 * products). Server Components call these directly; the browser never does,
 * so no auth token is needed (catalog reads are @Public on the API).
 *
 * The contract mirrors `apps/api/src/products` — note prices arrive as
 * strings (Prisma Decimal serialized as JSON), never as numbers.
 */

export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface ProductImage {
  id: string;
  url: string;
  alt: string | null;
  position: number;
}

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export interface ProductSeller {
  displayName: string;
  slug: string;
}

/** Public seller profile (storefront seller page). Mirrors GET /sellers/:slug. */
export interface Seller {
  id: string;
  displayName: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  description: string;
  /** Decimal serialized as a string, e.g. "799.00". */
  price: string;
  /** Sale price, or null when not on sale. */
  salePrice: string | null;
  brand: string | null;
  status: ProductStatus;
  categoryId: string;
  category?: ProductCategory;
  images?: ProductImage[];
  /** The owning seller (shop name + slug). Present on product detail; may be
   *  absent on list responses. Public-safe fields only — never KYC/status. */
  seller?: ProductSeller;
  /** Average rating as a Decimal string, or null until the product has reviews. */
  ratingAvg: string | null;
  /** Number of published reviews; 0 until reviews exist. */
  ratingCount: number;
}

/** Paginated envelope mirroring the API's list response. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Search query mirroring the API's /products/search facet surface. */
export interface SearchQuery {
  q?: string;
  page?: number;
  pageSize?: number;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  brand?: string;
  minRating?: number;
}

/** Facet buckets mirroring the API's SearchFacets (counts + price min/max). */
export interface SearchFacets {
  brands: { value: string; count: number }[];
  categories: { categoryId: string; name: string; count: number }[];
  price: { min: string; max: string } | null;
  ratings: { minRating: number; count: number }[];
}

/** Search response: a paginated product page plus facet buckets. */
export interface SearchResult extends Paginated<Product> {
  facets: SearchFacets;
}

/** A category with optional parent and (non-deleted) children, per the API. */
export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  parent?: Category | null;
  children?: Category[];
}

/** Sortable product columns (mirrors the API's ProductSortBy). */
export type ProductSortBy = 'createdAt' | 'price' | 'name';
export type SortDir = 'asc' | 'desc';

/**
 * Product list query mirroring the API's search/filter/sort surface.
 * `status` is supported by the API and used server-side (e.g. related
 * products); it is intentionally not exposed in the storefront filter UI.
 */
export interface ListProductsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  status?: ProductStatus;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: ProductSortBy;
  sortDir?: SortDir;
}

/** Injectable deps so the client is unit-testable without a real server. */
export interface CatalogOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

/** Error carrying the API's HTTP status and a flattened message. */
export class CatalogError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CatalogError';
  }
}

interface ApiErrorBody {
  message?: string | string[];
  error?: string;
}

function messageFrom(body: unknown, status: number): string {
  const b = body as ApiErrorBody | null;
  if (b && Array.isArray(b.message)) return b.message.join(', ');
  if (b && typeof b.message === 'string') return b.message;
  if (b && typeof b.error === 'string') return b.error;
  return `Request failed with status ${status}`;
}

/** Build a query string from defined params only. */
function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export async function listProducts(
  query: ListProductsQuery,
  { baseUrl, fetch: fetchImpl = fetch }: CatalogOptions,
): Promise<Paginated<Product>> {
  const url = `${baseUrl}/products${toQuery({
    page: query.page,
    pageSize: query.pageSize,
    search: query.search,
    categoryId: query.categoryId,
    status: query.status,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
  })}`;
  const res = await fetchImpl(url, { cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new CatalogError(messageFrom(body, res.status), res.status);
  return body as Paginated<Product>;
}

/** Fetch a single product; returns null on 404, throws on other errors. */
export async function getProduct(
  id: string,
  { baseUrl, fetch: fetchImpl = fetch }: CatalogOptions,
): Promise<Product | null> {
  const res = await fetchImpl(`${baseUrl}/products/${id}`, {
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new CatalogError(messageFrom(body, res.status), res.status);
  return body as Product;
}

/** List a seller's ACTIVE products (paginated). Mirrors GET /sellers/:slug/products. */
export async function listSellerProducts(
  slug: string,
  query: { page?: number; pageSize?: number },
  { baseUrl, fetch: fetchImpl = fetch }: CatalogOptions,
): Promise<Paginated<Product>> {
  const url = `${baseUrl}/sellers/${slug}/products${toQuery({
    page: query.page,
    pageSize: query.pageSize,
  })}`;
  const res = await fetchImpl(url, { cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new CatalogError(messageFrom(body, res.status), res.status);
  return body as Paginated<Product>;
}

/** Faceted full-text search against /products/search. */
export async function searchProducts(
  query: SearchQuery,
  { baseUrl, fetch: fetchImpl = fetch }: CatalogOptions,
): Promise<SearchResult> {
  const url = `${baseUrl}/products/search${toQuery({
    q: query.q,
    page: query.page,
    pageSize: query.pageSize,
    categoryId: query.categoryId,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    brand: query.brand,
    minRating: query.minRating,
  })}`;
  const res = await fetchImpl(url, { cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new CatalogError(messageFrom(body, res.status), res.status);
  return body as SearchResult;
}

/** Max related products shown on a detail page. */
const RELATED_LIMIT = 4;

/**
 * Related products: other ACTIVE products in the same category, excluding the
 * current product, capped at RELATED_LIMIT. Simple, server-authoritative
 * heuristic — PRD excludes recommendation engines.
 */
export async function getRelatedProducts(
  categoryId: string,
  excludeProductId: string,
  opts: CatalogOptions,
): Promise<Product[]> {
  // Fetch a few extra so excluding the current product still yields a full row.
  const { data } = await listProducts(
    {
      categoryId,
      status: 'ACTIVE',
      pageSize: RELATED_LIMIT + 1,
    },
    opts,
  );
  return data.filter((p) => p.id !== excludeProductId).slice(0, RELATED_LIMIT);
}

/** Fetch the category tree (roots with nested children). */
export async function listCategories({
  baseUrl,
  fetch: fetchImpl = fetch,
}: CatalogOptions): Promise<Category[]> {
  const res = await fetchImpl(`${baseUrl}/categories`, { cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new CatalogError(messageFrom(body, res.status), res.status);
  return body as Category[];
}

/** Fetch a single category by id or slug; returns null on 404. */
export async function getCategory(
  idOrSlug: string,
  { baseUrl, fetch: fetchImpl = fetch }: CatalogOptions,
): Promise<Category | null> {
  const res = await fetchImpl(`${baseUrl}/categories/${idOrSlug}`, {
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new CatalogError(messageFrom(body, res.status), res.status);
  return body as Category;
}

/** Fetch a public seller profile by slug; null on 404, throws on other errors. */
export async function getSeller(
  slug: string,
  { baseUrl, fetch: fetchImpl = fetch }: CatalogOptions,
): Promise<Seller | null> {
  const res = await fetchImpl(`${baseUrl}/sellers/${slug}`, {
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new CatalogError(messageFrom(body, res.status), res.status);
  return body as Seller;
}

// --- Server-bound convenience wrappers (called from Server Components) -------
// These bind the configured API base URL, mirroring session.ts/getCurrentUser.

/** List products against the configured API. */
export function getProducts(
  query: ListProductsQuery = {},
): Promise<Paginated<Product>> {
  return listProducts(query, { baseUrl: apiBaseUrl() });
}

/** Fetch a single product against the configured API (null on 404). */
export function getProductById(id: string): Promise<Product | null> {
  return getProduct(id, { baseUrl: apiBaseUrl() });
}

/** Related products for a detail page against the configured API. */
export function getRelatedProductsFor(
  categoryId: string,
  excludeProductId: string,
): Promise<Product[]> {
  return getRelatedProducts(categoryId, excludeProductId, {
    baseUrl: apiBaseUrl(),
  });
}

/** Fetch the category tree against the configured API. */
export function getCategoryTree(): Promise<Category[]> {
  return listCategories({ baseUrl: apiBaseUrl() });
}

/** Fetch a category by id or slug against the configured API (null on 404). */
export function getCategoryByIdOrSlug(
  idOrSlug: string,
): Promise<Category | null> {
  return getCategory(idOrSlug, { baseUrl: apiBaseUrl() });
}

/** Fetch a public seller profile against the configured API (null on 404). */
export function getSellerBySlug(slug: string): Promise<Seller | null> {
  return getSeller(slug, { baseUrl: apiBaseUrl() });
}

/** List a seller's products against the configured API. */
export function getSellerProducts(
  slug: string,
  query: { page?: number; pageSize?: number } = {},
): Promise<Paginated<Product>> {
  return listSellerProducts(slug, query, { baseUrl: apiBaseUrl() });
}

/** Faceted search against the configured API. */
export function getSearchResults(query: SearchQuery = {}): Promise<SearchResult> {
  return searchProducts(query, { baseUrl: apiBaseUrl() });
}
