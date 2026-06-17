import 'server-only';
import { cookies } from 'next/headers';
import {
  ApiAuthError,
  refresh as apiRefresh,
  type TokenPair,
} from './api-auth';
import { apiBaseUrl } from './env';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  cookieOptions,
} from './session';

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

/** Injectable deps so the authed-fetch + refresh are unit-testable. */
export interface CartApiDeps {
  baseUrl: string;
  getAccessToken(): string | undefined;
  getRefreshToken(): string | undefined;
  onTokensRefreshed(pair: TokenPair): void | Promise<void>;
  onSessionInvalid(): void | Promise<void>;
  refresh?(refreshToken: string): Promise<TokenPair>;
  fetch?: typeof fetch;
}

interface ApiErrorBody {
  message?: string | string[];
  error?: string;
}

function messageFrom(body: unknown, status: number): string {
  const b = body as ApiErrorBody | null;
  if (b && Array.isArray(b.message)) return b.message.join(', ');
  if (b && typeof b.message === 'string') return b.message;
  if (b && typeof b.error === 'string') return b.error;
  return `Request failed with status ${status}`;
}

async function callOnce<T>(
  path: string,
  init: RequestInit,
  accessToken: string | undefined,
  deps: CartApiDeps,
): Promise<T> {
  const fetchImpl = deps.fetch ?? fetch;
  const res = await fetchImpl(`${deps.baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new ApiAuthError(messageFrom(body, res.status), res.status);
  return body as T;
}

/** Call the cart API with the access token; refresh once on 401 and retry. */
export async function cartRequest<T>(
  path: string,
  init: RequestInit,
  deps: CartApiDeps,
): Promise<T> {
  const accessToken = deps.getAccessToken();
  try {
    return await callOnce<T>(path, init, accessToken, deps);
  } catch (err) {
    if (!(err instanceof ApiAuthError) || err.status !== 401) throw err;
  }

  const refreshToken = deps.getRefreshToken();
  const refreshFn = deps.refresh ?? ((t: string) => apiRefresh(t, { baseUrl: deps.baseUrl }));
  if (!refreshToken) {
    await deps.onSessionInvalid();
    throw new ApiAuthError('Session expired', 401);
  }
  try {
    const pair = await refreshFn(refreshToken);
    await deps.onTokensRefreshed(pair);
    return await callOnce<T>(path, init, pair.accessToken, deps);
  } catch {
    await deps.onSessionInvalid();
    throw new ApiAuthError('Session expired', 401);
  }
}

export function getCart(deps: CartApiDeps): Promise<CartView> {
  return cartRequest<CartView>('/cart', { method: 'GET' }, deps);
}

export function addItem(productId: string, quantity: number, deps: CartApiDeps): Promise<CartView> {
  return cartRequest<CartView>(
    '/cart/items',
    { method: 'POST', body: JSON.stringify({ productId, quantity }) },
    deps,
  );
}

export function setItemQuantity(productId: string, quantity: number, deps: CartApiDeps): Promise<CartView> {
  return cartRequest<CartView>(
    `/cart/items/${encodeURIComponent(productId)}`,
    { method: 'PATCH', body: JSON.stringify({ quantity }) },
    deps,
  );
}

export function removeItem(productId: string, deps: CartApiDeps): Promise<CartView> {
  return cartRequest<CartView>(
    `/cart/items/${encodeURIComponent(productId)}`,
    { method: 'DELETE' },
    deps,
  );
}

export function clearCart(deps: CartApiDeps): Promise<CartView> {
  return cartRequest<CartView>('/cart', { method: 'DELETE' }, deps);
}

/** Build live deps bound to cookies() + apiBaseUrl (Server Components / handlers). */
export async function liveCartDeps(): Promise<CartApiDeps> {
  const store = await cookies();
  const isProd = process.env.NODE_ENV === 'production';
  return {
    baseUrl: apiBaseUrl(),
    getAccessToken: () => store.get(ACCESS_COOKIE)?.value,
    getRefreshToken: () => store.get(REFRESH_COOKIE)?.value,
    onTokensRefreshed: (pair) => {
      store.set(ACCESS_COOKIE, pair.accessToken, cookieOptions(isProd));
      store.set(REFRESH_COOKIE, pair.refreshToken, cookieOptions(isProd));
    },
    onSessionInvalid: () => {
      store.delete(ACCESS_COOKIE);
      store.delete(REFRESH_COOKIE);
    },
  };
}
