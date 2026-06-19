import { apiClient } from './apiClient';

/** Mirrors the API OrderStatus enum. */
export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

/** A row in the admin order list (mirrors API AdminOrderSummary). */
export interface AdminOrderSummary {
  id: string;
  status: OrderStatus;
  grandTotal: string;
  itemCount: number;
  customerEmail: string;
  customerName: string;
  createdAt: string;
}

/** Paginated envelope mirroring the API list response. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListOrdersQuery {
  page?: number;
  pageSize?: number;
  status?: OrderStatus;
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

/** List all orders across customers (ADMIN). */
export function listOrders(
  query: ListOrdersQuery = {},
): Promise<Paginated<AdminOrderSummary>> {
  const path = `/admin/orders${toQuery({
    page: query.page,
    pageSize: query.pageSize,
    status: query.status,
  })}`;
  return apiClient.request<Paginated<AdminOrderSummary>>(path);
}
