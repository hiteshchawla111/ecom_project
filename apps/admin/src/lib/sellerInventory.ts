import { apiClient } from './apiClient';
import type { Paginated } from './products';

/**
 * A stock row as returned by GET /seller/inventory (mirrors the API StockRow).
 *
 * Note: `name` and `sku` are flattened from the nested `product` relation by
 * the API's `toStockRow` mapper before sending the response — they arrive as
 * top-level strings. `isLowStock` is a computed flag the API adds (available <=
 * lowStockThreshold) and is included to match the real API contract exactly.
 */
export interface SellerStockRow {
  productId: string;
  name: string;
  sku: string;
  available: number;
  reserved: number;
  lowStockThreshold: number;
  /** Computed by the API: true when available <= lowStockThreshold. */
  isLowStock: boolean;
}

export interface ListSellerStockQuery {
  page?: number;
  pageSize?: number;
  /** Filter to rows where available <= lowStockThreshold (supported by the API). */
  lowStock?: boolean;
}

function toQuery(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** List the acting seller's own stock (scoped server-side to the seller). */
export function listSellerStock(
  query: ListSellerStockQuery = {},
): Promise<Paginated<SellerStockRow>> {
  const path = `/seller/inventory${toQuery({
    page: query.page,
    pageSize: query.pageSize,
    lowStock: query.lowStock,
  })}`;
  return apiClient.request<Paginated<SellerStockRow>>(path);
}
