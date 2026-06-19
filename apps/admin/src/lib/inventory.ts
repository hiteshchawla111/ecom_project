import { apiClient } from './apiClient';

/** A row in the admin stock list (mirrors API StockRow). */
export interface StockRow {
  productId: string;
  name: string;
  sku: string;
  available: number;
  reserved: number;
  lowStockThreshold: number;
  isLowStock: boolean;
}

/** Paginated envelope mirroring the API list response. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListStockQuery {
  page?: number;
  pageSize?: number;
  lowStock?: boolean;
}

/** Build a query string from defined/truthy params only. */
function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** List inventory stock (ADMIN / INVENTORY_MANAGER). */
export function listStock(
  query: ListStockQuery = {},
): Promise<Paginated<StockRow>> {
  return apiClient.request<Paginated<StockRow>>(
    `/inventory${toQuery({
      page: query.page,
      pageSize: query.pageSize,
      // Only send lowStock when filtering; omit it otherwise.
      lowStock: query.lowStock ? 'true' : undefined,
    })}`,
  );
}
