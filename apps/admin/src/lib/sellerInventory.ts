import { apiClient } from './apiClient';
import type { Paginated } from './products';
import type {
  MovementView,
  CreateMovementInput,
  InventoryReport,
} from './inventory';

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

/** A seller's stock item with its movement history (mirrors the API StockItemView). */
export interface SellerStockItemView extends SellerStockRow {
  movements: MovementView[];
}

/** Fetch one of the seller's stock items + recent movements. */
export function getSellerStockItem(
  productId: string,
): Promise<SellerStockItemView> {
  return apiClient.request<SellerStockItemView>(`/seller/inventory/${productId}`);
}

/** Fetch the acting seller's own inventory report (scoped server-side). */
export function getSellerInventoryReport(): Promise<InventoryReport> {
  return apiClient.request<InventoryReport>('/seller/inventory/reports');
}

/** Post a manual stock movement against the seller's own product. */
export function createSellerMovement(
  productId: string,
  input: CreateMovementInput,
): Promise<void> {
  return apiClient.request<void>(`/seller/inventory/${productId}/movements`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
