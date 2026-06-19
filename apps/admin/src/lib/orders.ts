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

/** A line item on an order (mirrors API OrderItemView). */
export interface OrderItem {
  productId: string;
  productName: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

/** Full order detail (mirrors API AdminOrderView). */
export interface AdminOrderDetail {
  id: string;
  status: OrderStatus;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  shippingTotal: string;
  grandTotal: string;
  shipFullName: string;
  shipLine1: string;
  shipLine2: string | null;
  shipCity: string;
  shipState: string;
  shipCountry: string;
  shipPostalCode: string;
  customerEmail: string;
  customerName: string;
  items: OrderItem[];
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

/** Fetch a single order's full detail (ADMIN). */
export function getOrder(id: string): Promise<AdminOrderDetail> {
  return apiClient.request<AdminOrderDetail>(`/admin/orders/${id}`);
}

/**
 * Drive an order to a new status (ADMIN). Returns the updated order.
 *
 * Note: reads use `/admin/orders`, but the status transition deliberately uses
 * the shared `PATCH /orders/:id/status` route (`@Roles(ADMIN, CUSTOMER)` on the
 * API — admins drive any valid transition, customers may only self-cancel).
 * There is no separate `/admin/orders/:id/status`; this is intentional.
 */
export function updateOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<AdminOrderDetail> {
  return apiClient.request<AdminOrderDetail>(`/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
