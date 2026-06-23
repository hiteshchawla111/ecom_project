import { apiClient } from './apiClient';
import type {
  Paginated,
  Product,
  ListProductsQuery,
  CreateProductInput,
  UpdateProductInput,
} from './products';

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

function pruneUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/** List the acting seller's own products (scoped server-side to the seller). */
export function listSellerProducts(
  query: ListProductsQuery = {},
): Promise<Paginated<Product>> {
  const path = `/seller/products${toQuery({
    page: query.page,
    pageSize: query.pageSize,
  })}`;
  return apiClient.request<Paginated<Product>>(path);
}

export function getSellerProduct(id: string): Promise<Product> {
  return apiClient.request<Product>(`/seller/products/${id}`);
}

export function createSellerProduct(input: CreateProductInput): Promise<Product> {
  return apiClient.request<Product>('/seller/products', {
    method: 'POST',
    body: JSON.stringify(pruneUndefined(input)),
  });
}

export function updateSellerProduct(
  id: string,
  input: UpdateProductInput,
): Promise<Product> {
  return apiClient.request<Product>(`/seller/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(pruneUndefined(input)),
  });
}

export function archiveSellerProduct(id: string): Promise<Product> {
  return apiClient.request<Product>(`/seller/products/${id}/archive`, {
    method: 'POST',
  });
}

export function setSellerProductActive(
  id: string,
  active: boolean,
): Promise<Product> {
  return apiClient.request<Product>(`/seller/products/${id}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  });
}

/** One failed row in a bulk import (mirrors the API RowError). */
export interface RowError {
  row: number;
  sku?: string;
  message: string;
}

/** Result of a bulk product import (mirrors the API ImportResult). */
export interface ImportResult {
  created: number;
  failed: number;
  productIds: string[];
  errors: RowError[];
}

/** Upload a CSV of products for the acting seller (multipart, field "file"). */
export function importSellerProducts(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  return apiClient.request<ImportResult>('/seller/products/import', {
    method: 'POST',
    body: form,
  });
}
