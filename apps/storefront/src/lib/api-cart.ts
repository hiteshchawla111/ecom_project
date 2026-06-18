// apps/storefront/src/lib/api-cart.ts
import 'server-only';
import { authedRequest, liveAuthedDeps, type AuthedApiDeps } from './api-authed';

/** One cart line (mirrors API CartItemView). */
export interface CartItemView {
  productId: string;
  name: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  image: string | null;
}

/** Cart totals as 2-dp strings (mirrors API CartTotals). */
export interface CartTotals {
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  shippingTotal: string;
  grandTotal: string;
}

/** The cart envelope every endpoint returns (mirrors API CartView). */
export interface CartView {
  id: string;
  items: CartItemView[];
  totals: CartTotals;
}

/** Back-compat alias: cart callers used CartApiDeps before the core was shared. */
export type CartApiDeps = AuthedApiDeps;

export function getCart(deps: AuthedApiDeps): Promise<CartView> {
  return authedRequest<CartView>('/cart', { method: 'GET' }, deps);
}

export function addItem(productId: string, quantity: number, deps: AuthedApiDeps): Promise<CartView> {
  return authedRequest<CartView>(
    '/cart/items',
    { method: 'POST', body: JSON.stringify({ productId, quantity }) },
    deps,
  );
}

export function setItemQuantity(productId: string, quantity: number, deps: AuthedApiDeps): Promise<CartView> {
  return authedRequest<CartView>(
    `/cart/items/${encodeURIComponent(productId)}`,
    { method: 'PATCH', body: JSON.stringify({ quantity }) },
    deps,
  );
}

export function removeItem(productId: string, deps: AuthedApiDeps): Promise<CartView> {
  return authedRequest<CartView>(
    `/cart/items/${encodeURIComponent(productId)}`,
    { method: 'DELETE' },
    deps,
  );
}

export function clearCart(deps: AuthedApiDeps): Promise<CartView> {
  return authedRequest<CartView>('/cart', { method: 'DELETE' }, deps);
}

/** Back-compat re-export: cart route-deps imports liveCartDeps. */
export const liveCartDeps = liveAuthedDeps;
