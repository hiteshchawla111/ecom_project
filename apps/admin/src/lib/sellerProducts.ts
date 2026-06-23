import { apiClient } from './apiClient';
import type { Paginated, Product, ListProductsQuery } from './products';

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
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
