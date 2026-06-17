import { apiClient } from './apiClient';

/** Mirrors the API ProductStatus enum. */
export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

/** A product as returned by the API (prices are Decimal-as-string). */
export interface Product {
  id: string;
  name: string;
  sku: string;
  description: string;
  price: string;
  salePrice: string | null;
  brand: string | null;
  status: ProductStatus;
  categoryId: string;
}

/** Paginated envelope mirroring the API list response. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListProductsQuery {
  page?: number;
  pageSize?: number;
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

export function listProducts(
  query: ListProductsQuery = {},
): Promise<Paginated<Product>> {
  const path = `/products${toQuery({
    page: query.page,
    pageSize: query.pageSize,
  })}`;
  return apiClient.request<Paginated<Product>>(path);
}

/** Fields accepted when creating a product (mirrors the API CreateProductDto). */
export interface CreateProductInput {
  name: string;
  sku: string;
  description: string;
  price: number;
  salePrice?: number;
  brand?: string;
  categoryId: string;
}

/** Fields accepted when updating a product — SKU and status are immutable here. */
export interface UpdateProductInput {
  name: string;
  description: string;
  price: number;
  salePrice?: number;
  brand?: string;
  categoryId: string;
}

/** Fetch a single product by id (ADMIN). */
export function getProduct(id: string): Promise<Product> {
  return apiClient.request<Product>(`/products/${id}`);
}

/** Create a product (ADMIN). Optional fields are dropped when undefined. */
export function createProduct(input: CreateProductInput): Promise<Product> {
  return apiClient.request<Product>('/products', {
    method: 'POST',
    body: JSON.stringify(pruneUndefined(input)),
  });
}

/** Update a product (ADMIN). */
export function updateProduct(
  id: string,
  input: UpdateProductInput,
): Promise<Product> {
  return apiClient.request<Product>(`/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(pruneUndefined(input)),
  });
}

/** Drop keys whose value is undefined so they aren't serialized as null. */
function pruneUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/** Archive a product (ADMIN). */
export function archiveProduct(id: string): Promise<Product> {
  return apiClient.request<Product>(`/products/${id}/archive`, {
    method: 'POST',
  });
}

/** Activate or deactivate a product (ADMIN). */
export function setProductActive(
  id: string,
  active: boolean,
): Promise<Product> {
  return apiClient.request<Product>(`/products/${id}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  });
}
