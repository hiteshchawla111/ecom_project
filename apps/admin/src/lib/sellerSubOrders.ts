import { apiClient } from './apiClient';

/** Mirrors the API SubOrderStatus enum (identical to OrderStatus values). */
export type SubOrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface SubOrderItemView {
  productId: string;
  productName: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  sellerName: string;
}

export interface SubOrderView {
  id: string;
  orderId: string;
  status: SubOrderStatus;
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
  items: SubOrderItemView[];
  createdAt: string;
}

/** Cursor-paginated page (NOT the offset Paginated<T> shape). */
export interface SubOrderPage {
  data: SubOrderView[];
  nextCursor: string | null;
}

export interface ListSubOrdersQuery {
  cursor?: string;
  limit?: number;
  status?: SubOrderStatus;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** The acting seller's SubOrders (scoped server-side; admin sees cross-seller). */
export function fetchSubOrders(query: ListSubOrdersQuery = {}): Promise<SubOrderPage> {
  const path = `/seller/suborders${toQuery({
    cursor: query.cursor,
    limit: query.limit,
    status: query.status,
  })}`;
  return apiClient.request<SubOrderPage>(path);
}

/** Transition one SubOrder; 404 if not the caller's, 409 if the move is invalid. */
export function updateSubOrderStatus(
  id: string,
  status: SubOrderStatus,
): Promise<SubOrderView> {
  return apiClient.request<SubOrderView>(`/seller/suborders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
