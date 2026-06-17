import { ApiAuthError } from '@/lib/api-auth';
import type { CartView } from '@/lib/api-cart';

export interface CartHandlerResult {
  status: number;
  body: unknown;
}

/** Injectable cart operations so handlers are testable without cookies/Next. */
export interface CartRouteDeps {
  getCart(): Promise<CartView>;
  addItem(productId: string, quantity: number): Promise<CartView>;
  setItemQuantity(productId: string, quantity: number): Promise<CartView>;
  removeItem(productId: string): Promise<CartView>;
  clearCart(): Promise<CartView>;
}

function badRequest(message: string): CartHandlerResult {
  return { status: 400, body: { message } };
}

/** Map an upstream API error to a client result; rethrow the unexpected. */
function fromApiError(err: unknown): CartHandlerResult {
  if (err instanceof ApiAuthError) {
    return { status: err.status, body: { message: err.message } };
  }
  throw err;
}

const ok = (body: CartView): CartHandlerResult => ({ status: 200, body });

export async function handleGetCart(deps: CartRouteDeps): Promise<CartHandlerResult> {
  try {
    return ok(await deps.getCart());
  } catch (err) {
    return fromApiError(err);
  }
}

export async function handleAddItem(
  input: { productId?: unknown; quantity?: unknown },
  deps: CartRouteDeps,
): Promise<CartHandlerResult> {
  const productId = typeof input.productId === 'string' ? input.productId.trim() : '';
  const quantity = Number(input.quantity);
  if (!productId) return badRequest('productId is required.');
  if (!Number.isInteger(quantity) || quantity < 1) return badRequest('quantity must be a positive integer.');
  try {
    return ok(await deps.addItem(productId, quantity));
  } catch (err) {
    return fromApiError(err);
  }
}

export async function handleSetQuantity(
  productId: string,
  input: { quantity?: unknown },
  deps: CartRouteDeps,
): Promise<CartHandlerResult> {
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 0) return badRequest('quantity must be a non-negative integer.');
  try {
    return ok(await deps.setItemQuantity(productId, quantity));
  } catch (err) {
    return fromApiError(err);
  }
}

export async function handleRemoveItem(
  productId: string,
  deps: CartRouteDeps,
): Promise<CartHandlerResult> {
  try {
    return ok(await deps.removeItem(productId));
  } catch (err) {
    return fromApiError(err);
  }
}

export async function handleClearCart(deps: CartRouteDeps): Promise<CartHandlerResult> {
  try {
    return ok(await deps.clearCart());
  } catch (err) {
    return fromApiError(err);
  }
}
