import 'server-only';
import { authedRequest, type AuthedApiDeps } from './api-authed';

export type { AuthedApiDeps } from './api-authed';

/** One order line (mirrors API OrderItemView). */
export interface OrderItemView {
  productId: string;
  productName: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

/** A placed order (mirrors API OrderView; createdAt is a JSON string). */
export interface OrderView {
  id: string;
  status: string;
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
  items: OrderItemView[];
  createdAt: string;
}

/** Shipping payload for checkout (mirrors API CheckoutDto). */
export interface CheckoutInput {
  shipFullName: string;
  shipLine1: string;
  shipLine2?: string;
  shipCity: string;
  shipState: string;
  shipCountry: string;
  shipPostalCode: string;
}

export function placeOrder(input: CheckoutInput, deps: AuthedApiDeps): Promise<OrderView> {
  return authedRequest<OrderView>(
    '/orders',
    { method: 'POST', body: JSON.stringify(input) },
    deps,
  );
}

export function getOrder(id: string, deps: AuthedApiDeps): Promise<OrderView> {
  return authedRequest<OrderView>(
    `/orders/${encodeURIComponent(id)}`,
    { method: 'GET' },
    deps,
  );
}
