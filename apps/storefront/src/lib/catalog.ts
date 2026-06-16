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
}

/** Paginated envelope mirroring the API's list response. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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

/** Subset of the API product list query this slice uses. */
export interface ListProductsQuery {
  page?: number;
  pageSize?: number;
  categoryId?: string;
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
    categoryId: query.categoryId,
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
