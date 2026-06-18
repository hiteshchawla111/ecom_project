# Storefront Checkout Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A gated `/checkout` page (order review + shipping form → place order) and an order confirmation page (`/orders/[id]`), consuming the existing `POST /orders` and `GET /orders/:id` APIs through Next Route Handlers. Completes Phase 4.

**Architecture:** First extract the shared authed-fetch + refresh-on-401 core out of `lib/api-cart.ts` into `lib/api-authed.ts` (behavior-preserving) so cart and the new `lib/api-orders.ts` reuse one wrapper. Then build the orders client, a `POST /api/orders` route handler, the `/checkout` page + form, the `/orders/[id]` confirmation page, and route gating — all mirroring the established cart/auth patterns (route-handler proxy with the httpOnly cookie; client form → handler; SSR reads server-side).

**Tech Stack:** Next.js (App Router, RSC) + TypeScript, Tailwind v4, Vitest + RTL, Playwright. Consumes `apps/api` `/orders` endpoints.

**Spec:** `docs/superpowers/specs/2026-06-17-storefront-checkout-design.md`

## Global Constraints

- Strict TypeScript; no `any` in non-test code. Functional components + hooks.
- **Never compute prices/totals client-side** — render the API's strings verbatim via `formatPrice` (from `@/lib/money`). Flag any arithmetic on money fields.
- Authed API calls go through Next Route Handlers that read the httpOnly `sf_access`/`sf_refresh` cookies server-side — tokens never reach the browser. `lib/api-authed.ts`, `lib/api-orders.ts`, and `app/api/orders/route-deps.ts` are `server-only`; client components import only TYPES from them (type-only imports erase at compile time).
- The refactor (Task 1) MUST be behavior-preserving: the existing `apps/storefront/src/lib/api-cart.test.ts` and all cart/route-protection tests stay green WITHOUT being edited (except the deliberate move of refresh-on-401 cases noted in Task 1).
- Money/totals are 2-dp strings from the API. `OrderView` mirrors the API (note `createdAt` arrives as a JSON string).
- `/checkout` and `/orders` are CUSTOMER-gated (middleware redirect on missing cookie; pages re-verify via `getCurrentUser()`). Confirmation ownership: the API returns 404 for non-owned/unknown orders → `notFound()`.
- After a successful place: reset the client cart store to empty via `hydrate(EMPTY_CART_VIEW)` (header badge → 0), then redirect to `/orders/<id>`.
- Accessibility: semantic HTML, labelled form fields, focus-visible rings (match existing components), never color-only.
- Fixed dev ports: storefront `:5001`, API `:5000`. Storefront→API base from `apiBaseUrl()`.
- Shell cwd resets between tool calls — use `npm --prefix apps/storefront ...`. Branch `feat/storefront-checkout` (already created, spec committed). Commit per task; trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Commands: test `npm --prefix apps/storefront test`; single `npm --prefix apps/storefront test -- <pattern>`; lint `npm --prefix apps/storefront run lint`; build `npm --prefix apps/storefront run build`; e2e `npm --prefix apps/storefront run test:e2e`.

## File Structure

```
apps/storefront/src/
  lib/
    api-authed.ts          # NEW (Task 1) — shared AuthedApiDeps + authedRequest + liveAuthedDeps
    api-authed.test.ts     # NEW (Task 1) — the refresh-on-401 cases (moved from api-cart.test)
    api-cart.ts            # MODIFIED (Task 1) — uses authedRequest; CartApiDeps/liveCartDeps become aliases
    api-cart.test.ts       # MODIFIED (Task 1) — refresh cases moved out; cart-specific cases stay
    api-orders.ts          # NEW (Task 2) — OrderView/CheckoutInput types + placeOrder/getOrder
    api-orders.test.ts     # NEW (Task 2)
    route-protection.ts    # MODIFIED (Task 6) — add /checkout, /orders to PROTECTED_PREFIXES
    route-protection.test.ts # MODIFIED (Task 6)
  app/
    api/orders/
      handlers.ts          # NEW (Task 3) — handlePlaceOrder + OrdersRouteDeps
      handlers.test.ts     # NEW (Task 3)
      route-deps.ts        # NEW (Task 3) — liveOrdersRouteDeps()
      route.ts             # NEW (Task 3) — POST /api/orders
    checkout/page.tsx      # NEW (Task 4) — gated SSR checkout page
    orders/[id]/page.tsx   # NEW (Task 5) — gated SSR confirmation page
  components/
    checkout/CheckoutView.tsx     # NEW (Task 4) — review + shipping form + place
    checkout/CheckoutView.test.tsx# NEW (Task 4)
    orders/OrderSummary.tsx       # NEW (Task 5) — renders an OrderView
    orders/OrderSummary.test.tsx  # NEW (Task 5)
  proxy.ts                 # MODIFIED (Task 6) — add /checkout, /orders to matcher
  e2e/checkout.spec.ts     # NEW (Task 7)
```

---

### Task 1: Extract shared authed-request core (behavior-preserving refactor)

**Files:**
- Create: `apps/storefront/src/lib/api-authed.ts`
- Create: `apps/storefront/src/lib/api-authed.test.ts`
- Modify: `apps/storefront/src/lib/api-cart.ts`
- Modify: `apps/storefront/src/lib/api-cart.test.ts`

**Interfaces:**
- Consumes: `ApiAuthError`, `refresh as apiRefresh`, `type TokenPair` from `./api-auth`; `apiBaseUrl` from `./env`; `ACCESS_COOKIE`, `REFRESH_COOKIE`, `cookieOptions` from `./session`.
- Produces (from `api-authed.ts`):
  - `interface AuthedApiDeps { baseUrl; getAccessToken(): string|undefined; getRefreshToken(): string|undefined; onTokensRefreshed(pair: TokenPair): void|Promise<void>; onSessionInvalid(): void|Promise<void>; refresh?(refreshToken: string): Promise<TokenPair>; fetch?: typeof fetch }`
  - `async function authedRequest<T>(path: string, init: RequestInit, deps: AuthedApiDeps): Promise<T>`
  - `async function liveAuthedDeps(): Promise<AuthedApiDeps>`
- `api-cart.ts` re-exports for compatibility: `export type CartApiDeps = AuthedApiDeps;` and `export const liveCartDeps = liveAuthedDeps;` (so `app/api/cart/route-deps.ts` keeps working unchanged).

- [ ] **Step 1: Create `api-authed.ts` by moving the generic core out of `api-cart.ts`**

Create `apps/storefront/src/lib/api-authed.ts` with the EXACT generic machinery currently in `api-cart.ts` (the deps interface, `messageFrom`, `callOnce`, the request fn renamed `cartRequest`→`authedRequest`, and `liveCartDeps`→`liveAuthedDeps`):

```typescript
// apps/storefront/src/lib/api-authed.ts
import 'server-only';
import { cookies } from 'next/headers';
import {
  ApiAuthError,
  refresh as apiRefresh,
  type TokenPair,
} from './api-auth';
import { apiBaseUrl } from './env';
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieOptions } from './session';

/** Injectable deps so the authed-fetch + refresh are unit-testable. */
export interface AuthedApiDeps {
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
  deps: AuthedApiDeps,
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

/** Call an API path with the access token; refresh once on 401 and retry.
 *  A non-401 retry error is surfaced unchanged (not masked as 401). */
export async function authedRequest<T>(
  path: string,
  init: RequestInit,
  deps: AuthedApiDeps,
): Promise<T> {
  const accessToken = deps.getAccessToken();
  try {
    return await callOnce<T>(path, init, accessToken, deps);
  } catch (err) {
    if (!(err instanceof ApiAuthError) || err.status !== 401) throw err;
  }

  const refreshToken = deps.getRefreshToken();
  const refreshFn =
    deps.refresh ?? ((t: string) => apiRefresh(t, { baseUrl: deps.baseUrl }));
  if (!refreshToken) {
    await deps.onSessionInvalid();
    throw new ApiAuthError('Session expired', 401);
  }
  let pair: TokenPair;
  try {
    pair = await refreshFn(refreshToken);
  } catch {
    await deps.onSessionInvalid();
    throw new ApiAuthError('Session expired', 401);
  }

  await deps.onTokensRefreshed(pair);

  try {
    return await callOnce<T>(path, init, pair.accessToken, deps);
  } catch (retryErr) {
    if (retryErr instanceof ApiAuthError && retryErr.status === 401) {
      await deps.onSessionInvalid();
      throw new ApiAuthError('Session expired', 401);
    }
    throw retryErr;
  }
}

/** Build live deps bound to cookies() + apiBaseUrl (Server Components / handlers). */
export async function liveAuthedDeps(): Promise<AuthedApiDeps> {
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
```

- [ ] **Step 2: Rewrite `api-cart.ts` to consume the shared core**

Replace the entire contents of `apps/storefront/src/lib/api-cart.ts` with the cart-specific types + functions, now using `authedRequest`, and aliasing the deps/live helper for back-compat:

```typescript
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
```

- [ ] **Step 3: Move the refresh-on-401 tests into `api-authed.test.ts`; keep cart-specific tests in `api-cart.test.ts`**

The current `api-cart.test.ts` has 6 cases: 2 cart-specific (GET token-sent, POST add-item shape) and 4 generic refresh/error cases (refresh-retry, refresh-fail, non-401 retry surfaced, message flattening). Create `api-authed.test.ts` testing `authedRequest`/`getCart`-equivalent generic behavior, and trim `api-cart.test.ts` to the cart-specific assertions.

Create `apps/storefront/src/lib/api-authed.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { authedRequest, type AuthedApiDeps } from './api-authed';
import { ApiAuthError } from './api-auth';

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;
const errResponse = (status: number, body: unknown) =>
  ({ ok: false, status, json: async () => body }) as Response;

const baseDeps = (over: Partial<AuthedApiDeps> = {}): AuthedApiDeps => ({
  baseUrl: 'http://api.test',
  getAccessToken: () => 'access-1',
  getRefreshToken: () => 'refresh-1',
  onTokensRefreshed: vi.fn(),
  onSessionInvalid: vi.fn(),
  fetch: vi.fn(),
  ...over,
});

describe('authedRequest', () => {
  it('sends the bearer token and returns the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ ok: true }));
    const deps = baseDeps({ fetch: fetchMock });
    const res = await authedRequest('/thing', { method: 'GET' }, deps);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/thing',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ authorization: 'Bearer access-1' }),
      }),
    );
    expect(res).toEqual({ ok: true });
  });

  it('refreshes once on 401 then retries with the new token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(okResponse({ ok: true }));
    const onTokensRefreshed = vi.fn();
    const deps = baseDeps({
      fetch: fetchMock,
      onTokensRefreshed,
      refresh: vi.fn().mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2' }),
    });
    await authedRequest('/thing', { method: 'GET' }, deps);
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe('Bearer access-2');
    expect(onTokensRefreshed).toHaveBeenCalledWith({ accessToken: 'access-2', refreshToken: 'refresh-2' });
  });

  it('invalidates the session when refresh fails on 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(401, { message: 'expired' }));
    const onSessionInvalid = vi.fn();
    const deps = baseDeps({
      fetch: fetchMock,
      onSessionInvalid,
      refresh: vi.fn().mockRejectedValue(new ApiAuthError('bad', 401)),
    });
    await expect(authedRequest('/thing', { method: 'GET' }, deps)).rejects.toBeInstanceOf(ApiAuthError);
    expect(onSessionInvalid).toHaveBeenCalled();
  });

  it('surfaces a non-401 retry error honestly without invalidating the session', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(errResponse(500, { message: 'boom' }));
    const onSessionInvalid = vi.fn();
    const deps = baseDeps({
      fetch: fetchMock,
      onSessionInvalid,
      refresh: vi.fn().mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2' }),
    });
    await expect(authedRequest('/thing', { method: 'GET' }, deps)).rejects.toMatchObject({ status: 500 });
    expect(onSessionInvalid).not.toHaveBeenCalled();
  });

  it('flattens an array message from the API error body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(400, { message: ['a', 'b'] }));
    const deps = baseDeps({ fetch: fetchMock, getRefreshToken: () => undefined });
    await expect(authedRequest('/thing', { method: 'GET' }, deps)).rejects.toMatchObject({ status: 400, message: 'a, b' });
  });
});
```

Then trim `apps/storefront/src/lib/api-cart.test.ts` to the cart-specific cases only — replace its entire contents with:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { getCart, addItem, type CartApiDeps, type CartView } from './api-cart';

const envelope: CartView = {
  id: 'cart1',
  items: [
    { productId: 'p1', name: 'Mouse', unitPrice: '19.99', quantity: 2, lineTotal: '39.98', image: null },
  ],
  totals: { subtotal: '39.98', discountTotal: '0.00', taxTotal: '4.00', shippingTotal: '5.00', grandTotal: '48.98' },
};

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

const baseDeps = (over: Partial<CartApiDeps> = {}): CartApiDeps => ({
  baseUrl: 'http://api.test',
  getAccessToken: () => 'access-1',
  getRefreshToken: () => 'refresh-1',
  onTokensRefreshed: vi.fn(),
  onSessionInvalid: vi.fn(),
  fetch: vi.fn(),
  ...over,
});

describe('cart API client', () => {
  it('getCart issues GET /cart and returns the envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(envelope));
    const res = await getCart(baseDeps({ fetch: fetchMock }));
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/cart', expect.objectContaining({ method: 'GET' }));
    expect(res).toEqual(envelope);
  });

  it('addItem POSTs /cart/items with productId + quantity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(envelope));
    await addItem('p1', 2, baseDeps({ fetch: fetchMock }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/cart/items');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ productId: 'p1', quantity: 2 });
  });
});
```

- [ ] **Step 4: Run all affected tests + lint + build to prove the refactor is behavior-preserving**

Run: `npm --prefix apps/storefront test -- api-authed api-cart` → both suites green.
Run: `npm --prefix apps/storefront test -- "app/api/cart"` → cart handlers still green (they import `CartView` type — unaffected).
Run: `npm --prefix apps/storefront run lint && npm --prefix apps/storefront run build` → clean (confirms `app/api/cart/route-deps.ts` still resolves `liveCartDeps`/no broken imports).
Expected: all green/clean. If `route-deps.ts` breaks, the alias export in Step 2 is missing — fix the alias, do not edit route-deps.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/lib/api-authed.ts apps/storefront/src/lib/api-authed.test.ts apps/storefront/src/lib/api-cart.ts apps/storefront/src/lib/api-cart.test.ts
git commit -m "refactor(storefront): extract shared authedRequest core from api-cart"
```

---

### Task 2: `lib/api-orders.ts` — orders API client

**Files:**
- Create: `apps/storefront/src/lib/api-orders.ts`
- Create: `apps/storefront/src/lib/api-orders.test.ts`

**Interfaces:**
- Consumes: `authedRequest`, `type AuthedApiDeps` from `./api-authed`.
- Produces:
  - `interface OrderItemView { productId; productName; unitPrice; quantity; lineTotal }` (money strings, quantity number)
  - `interface OrderView { id; status: string; subtotal; discountTotal; taxTotal; shippingTotal; grandTotal; shipFullName; shipLine1; shipLine2: string|null; shipCity; shipState; shipCountry; shipPostalCode; items: OrderItemView[]; createdAt: string }`
  - `interface CheckoutInput { shipFullName; shipLine1; shipLine2?; shipCity; shipState; shipCountry; shipPostalCode }`
  - `placeOrder(input: CheckoutInput, deps: AuthedApiDeps): Promise<OrderView>` (POST /orders)
  - `getOrder(id: string, deps: AuthedApiDeps): Promise<OrderView>` (GET /orders/:id)

- [ ] **Step 1: Write the failing test**

```typescript
// apps/storefront/src/lib/api-orders.test.ts
import { describe, it, expect, vi } from 'vitest';
import { placeOrder, getOrder, type CheckoutInput, type OrderView, type AuthedApiDeps } from './api-orders';

const order: OrderView = {
  id: 'order1',
  status: 'PENDING',
  subtotal: '39.98', discountTotal: '0.00', taxTotal: '4.00', shippingTotal: '5.00', grandTotal: '48.98',
  shipFullName: 'Ada Lovelace', shipLine1: '12 Analytical Way', shipLine2: null,
  shipCity: 'London', shipState: 'Greater London', shipCountry: 'UK', shipPostalCode: 'EC1A 1BB',
  items: [{ productId: 'p1', productName: 'Mouse', unitPrice: '19.99', quantity: 2, lineTotal: '39.98' }],
  createdAt: '2026-06-17T12:00:00.000Z',
};

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

const baseDeps = (over: Partial<AuthedApiDeps> = {}): AuthedApiDeps => ({
  baseUrl: 'http://api.test',
  getAccessToken: () => 'access-1',
  getRefreshToken: () => 'refresh-1',
  onTokensRefreshed: vi.fn(),
  onSessionInvalid: vi.fn(),
  fetch: vi.fn(),
  ...over,
});

const shipping: CheckoutInput = {
  shipFullName: 'Ada Lovelace', shipLine1: '12 Analytical Way',
  shipCity: 'London', shipState: 'Greater London', shipCountry: 'UK', shipPostalCode: 'EC1A 1BB',
};

describe('orders API client', () => {
  it('placeOrder POSTs /orders with the shipping body and returns the order', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(order));
    const res = await placeOrder(shipping, baseDeps({ fetch: fetchMock }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/orders');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(shipping);
    expect(res).toEqual(order);
  });

  it('getOrder GETs /orders/:id (id encoded) and returns the order', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(order));
    const res = await getOrder('order 1', baseDeps({ fetch: fetchMock }));
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/orders/order%201',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(res).toEqual(order);
  });
});
```

> Note: the test re-exports `AuthedApiDeps` from `./api-orders` for convenience — add `export type { AuthedApiDeps } from './api-authed';` to `api-orders.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/storefront test -- api-orders`
Expected: FAIL — cannot find module `./api-orders`.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/storefront/src/lib/api-orders.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/storefront test -- api-orders`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npm --prefix apps/storefront run lint
git add apps/storefront/src/lib/api-orders.ts apps/storefront/src/lib/api-orders.test.ts
git commit -m "feat(storefront): server-only orders API client (placeOrder, getOrder)"
```

---

### Task 3: `POST /api/orders` Route Handler

**Files:**
- Create: `apps/storefront/src/app/api/orders/handlers.ts`
- Create: `apps/storefront/src/app/api/orders/handlers.test.ts`
- Create: `apps/storefront/src/app/api/orders/route-deps.ts`
- Create: `apps/storefront/src/app/api/orders/route.ts`

**Interfaces:**
- Consumes: `placeOrder`, `type OrderView`, `type CheckoutInput` from `@/lib/api-orders`; `liveAuthedDeps` from `@/lib/api-authed`; `ApiAuthError` from `@/lib/api-auth`.
- Produces:
  - `interface OrderHandlerResult { status: number; body: unknown }`
  - `interface OrdersRouteDeps { placeOrder(input: CheckoutInput): Promise<OrderView> }`
  - `handlePlaceOrder(input: Partial<CheckoutInput>, deps: OrdersRouteDeps): Promise<OrderHandlerResult>`
  - `liveOrdersRouteDeps(): OrdersRouteDeps`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/storefront/src/app/api/orders/handlers.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handlePlaceOrder, type OrdersRouteDeps } from './handlers';
import { ApiAuthError } from '@/lib/api-auth';
import type { OrderView } from '@/lib/api-orders';

const order = { id: 'o1', status: 'PENDING' } as OrderView;

const shipping = {
  shipFullName: 'Ada', shipLine1: '12 Way', shipCity: 'London',
  shipState: 'GL', shipCountry: 'UK', shipPostalCode: 'EC1A',
};

const deps = (over: Partial<OrdersRouteDeps> = {}): OrdersRouteDeps => ({
  placeOrder: vi.fn().mockResolvedValue(order),
  ...over,
});

describe('handlePlaceOrder', () => {
  it('returns 201 + the order on success', async () => {
    const d = deps();
    const res = await handlePlaceOrder(shipping, d);
    expect(d.placeOrder).toHaveBeenCalledWith(shipping);
    expect(res).toEqual({ status: 201, body: order });
  });

  it('returns 400 when a required shipping field is missing', async () => {
    const res = await handlePlaceOrder({ ...shipping, shipFullName: '' }, deps());
    expect(res.status).toBe(400);
  });

  it('maps an ApiAuthError to its status + message', async () => {
    const d = deps({ placeOrder: vi.fn().mockRejectedValue(new ApiAuthError('Your cart is empty', 400)) });
    const res = await handlePlaceOrder(shipping, d);
    expect(res).toEqual({ status: 400, body: { message: 'Your cart is empty' } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/storefront test -- orders/handlers`
Expected: FAIL — cannot find module `./handlers`.

- [ ] **Step 3: Write `handlers.ts`**

```typescript
// apps/storefront/src/app/api/orders/handlers.ts
import { ApiAuthError } from '@/lib/api-auth';
import type { CheckoutInput, OrderView } from '@/lib/api-orders';

export interface OrderHandlerResult {
  status: number;
  body: unknown;
}

/** Injectable order operations so handlers are testable without cookies/Next. */
export interface OrdersRouteDeps {
  placeOrder(input: CheckoutInput): Promise<OrderView>;
}

function badRequest(message: string): OrderHandlerResult {
  return { status: 400, body: { message } };
}

function fromApiError(err: unknown): OrderHandlerResult {
  if (err instanceof ApiAuthError) {
    return { status: err.status, body: { message: err.message } };
  }
  throw err;
}

/** Required (non-optional) shipping fields. shipLine2 is optional. */
const REQUIRED: (keyof CheckoutInput)[] = [
  'shipFullName',
  'shipLine1',
  'shipCity',
  'shipState',
  'shipCountry',
  'shipPostalCode',
];

export async function handlePlaceOrder(
  input: Partial<CheckoutInput>,
  deps: OrdersRouteDeps,
): Promise<OrderHandlerResult> {
  for (const key of REQUIRED) {
    const value = input[key];
    if (typeof value !== 'string' || value.trim() === '') {
      return badRequest(`${key} is required.`);
    }
  }
  try {
    const order = await deps.placeOrder({
      shipFullName: input.shipFullName!,
      shipLine1: input.shipLine1!,
      shipLine2: input.shipLine2,
      shipCity: input.shipCity!,
      shipState: input.shipState!,
      shipCountry: input.shipCountry!,
      shipPostalCode: input.shipPostalCode!,
    });
    return { status: 201, body: order };
  } catch (err) {
    return fromApiError(err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/storefront test -- orders/handlers`
Expected: PASS (3 cases).

- [ ] **Step 5: Write `route-deps.ts` + `route.ts`**

```typescript
// apps/storefront/src/app/api/orders/route-deps.ts
import 'server-only';
import { placeOrder as apiPlaceOrder } from '@/lib/api-orders';
import { liveAuthedDeps } from '@/lib/api-authed';
import type { OrdersRouteDeps } from './handlers';

export function liveOrdersRouteDeps(): OrdersRouteDeps {
  return {
    placeOrder: async (input) => apiPlaceOrder(input, await liveAuthedDeps()),
  };
}
```

```typescript
// apps/storefront/src/app/api/orders/route.ts
import { NextResponse } from 'next/server';
import { handlePlaceOrder } from './handlers';
import { liveOrdersRouteDeps } from './route-deps';

export async function POST(req: Request) {
  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handlePlaceOrder(
    {
      shipFullName: input.shipFullName as string,
      shipLine1: input.shipLine1 as string,
      shipLine2: input.shipLine2 as string | undefined,
      shipCity: input.shipCity as string,
      shipState: input.shipState as string,
      shipCountry: input.shipCountry as string,
      shipPostalCode: input.shipPostalCode as string,
    },
    liveOrdersRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 6: Lint + build + commit**

```bash
npm --prefix apps/storefront run lint && npm --prefix apps/storefront run build
git add apps/storefront/src/app/api/orders/
git commit -m "feat(storefront): POST /api/orders route handler proxying place-order"
```

---

### Task 4: `/checkout` page + CheckoutView (review + shipping form + place)

**Files:**
- Create: `apps/storefront/src/app/checkout/page.tsx`
- Create: `apps/storefront/src/components/checkout/CheckoutView.tsx`
- Create: `apps/storefront/src/components/checkout/CheckoutView.test.tsx`

**Interfaces:**
- Consumes: `getCurrentUser` from `@/lib/session`; `getCart`, `liveCartDeps`, `type CartView` from `@/lib/api-cart`; `redirect` from `next/navigation`; `useCart` from `@/components/cart/CartProvider`; `formatPrice` from `@/lib/money`; `useRouter` from `next/navigation`.
- Produces: `function CheckoutView({ cart }: { cart: CartView }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/storefront/src/components/checkout/CheckoutView.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { CartProvider } from '@/components/cart/CartProvider';
import { CheckoutView } from './CheckoutView';
import type { CartView } from '@/lib/api-cart';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const cart: CartView = {
  id: 'c1',
  items: [{ productId: 'p1', name: 'Mouse', unitPrice: '19.99', quantity: 2, lineTotal: '39.98', image: null }],
  totals: { subtotal: '39.98', discountTotal: '0.00', taxTotal: '4.00', shippingTotal: '5.00', grandTotal: '48.98' },
};

const fill = () => {
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Ada' } });
  fireEvent.change(screen.getByLabelText(/address line 1/i), { target: { value: '12 Way' } });
  fireEvent.change(screen.getByLabelText(/city/i), { target: { value: 'London' } });
  fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'GL' } });
  fireEvent.change(screen.getByLabelText(/country/i), { target: { value: 'UK' } });
  fireEvent.change(screen.getByLabelText(/postal code/i), { target: { value: 'EC1A' } });
};

const renderView = () =>
  render(<CartProvider initialCart={cart}><CheckoutView cart={cart} /></CartProvider>);

beforeEach(() => {
  pushMock.mockReset();
  global.fetch = vi.fn();
});

describe('CheckoutView', () => {
  it('renders the order review with the grand total from the cart envelope', () => {
    renderView();
    expect(screen.getByText('Mouse')).toBeInTheDocument();
    expect(screen.getByText('$48.98')).toBeInTheDocument();
  });

  it('does not submit when required fields are empty', async () => {
    renderView();
    await act(async () => { screen.getByRole('button', { name: /place order/i }).click(); });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('POSTs the shipping body and redirects to the order on success', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 201, json: async () => ({ id: 'order9' }),
    });
    renderView();
    fill();
    await act(async () => { screen.getByRole('button', { name: /place order/i }).click(); });
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/orders');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ shipFullName: 'Ada', shipPostalCode: 'EC1A' });
    expect(pushMock).toHaveBeenCalledWith('/orders/order9');
  });

  it('shows an inline error when the API returns a 400', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 400, json: async () => ({ message: 'Your cart is empty' }),
    });
    renderView();
    fill();
    await act(async () => { screen.getByRole('button', { name: /place order/i }).click(); });
    expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/storefront test -- checkout/CheckoutView`
Expected: FAIL — cannot find module `./CheckoutView`.

- [ ] **Step 3: Write `CheckoutView.tsx`**

```typescript
// apps/storefront/src/components/checkout/CheckoutView.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice } from '@/lib/money';
import { useCart } from '@/components/cart/CartProvider';
import type { CartView } from '@/lib/api-cart';

const FIELDS = [
  { name: 'shipFullName', label: 'Full name', required: true },
  { name: 'shipLine1', label: 'Address line 1', required: true },
  { name: 'shipLine2', label: 'Address line 2 (optional)', required: false },
  { name: 'shipCity', label: 'City', required: true },
  { name: 'shipState', label: 'State', required: true },
  { name: 'shipCountry', label: 'Country', required: true },
  { name: 'shipPostalCode', label: 'Postal code', required: true },
] as const;

type FieldName = (typeof FIELDS)[number]['name'];

const EMPTY_FORM: Record<FieldName, string> = {
  shipFullName: '', shipLine1: '', shipLine2: '',
  shipCity: '', shipState: '', shipCountry: '', shipPostalCode: '',
};

interface OrderResult {
  id?: string;
  message?: string;
}

export function CheckoutView({ cart }: { cart: CartView }) {
  const router = useRouter();
  const { hydrate } = useCart();
  const [form, setForm] = useState<Record<FieldName, string>>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const requiredFilled = FIELDS.every((f) => !f.required || form[f.name].trim() !== '');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requiredFilled) {
      setError('Please fill in all required fields.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const body = (await res.json().catch(() => null)) as OrderResult | null;
      if (!res.ok || !body?.id) {
        setError(body?.message ?? 'Unable to place your order.');
        return;
      }
      // Server cart is cleared by the API; reset the client store so the badge drops to 0.
      hydrate({
        id: '',
        items: [],
        totals: { subtotal: '0.00', discountTotal: '0.00', taxTotal: '0.00', shippingTotal: '0.00', grandTotal: '0.00' },
      });
      router.push(`/orders/${body.id}`);
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <form onSubmit={onSubmit} className="flex-1 flex flex-col gap-4" noValidate>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-600">Shipping details</h2>
        {FIELDS.map((f) => (
          <label key={f.name} className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-700">{f.label}</span>
            <input
              name={f.name}
              value={form[f.name]}
              required={f.required}
              onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
              className="rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
            />
          </label>
        ))}
        {error && <p className="text-sm text-error-500">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 inline-flex w-fit items-center justify-center rounded-md bg-primary-500 px-5 py-2.5 text-sm font-medium text-neutral-0 hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50"
        >
          {pending ? 'Placing order…' : 'Place order'}
        </button>
      </form>

      <aside className="w-full shrink-0 rounded-lg border border-neutral-200 bg-neutral-0 p-6 lg:w-80">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-600">Order review</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {cart.items.map((item) => (
            <li key={item.productId} className="flex justify-between gap-2">
              <span className="min-w-0 truncate text-neutral-700">{item.name} × {item.quantity}</span>
              <span className="tabular-nums text-neutral-900">{formatPrice(item.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 flex flex-col gap-2 border-t border-neutral-200 pt-4 text-sm">
          {/* discountTotal intentionally omitted — discounts/coupons are out of PRD scope (always 0.00) */}
          <Row label="Subtotal" value={cart.totals.subtotal} />
          <Row label="Tax" value={cart.totals.taxTotal} />
          <Row label="Shipping" value={cart.totals.shippingTotal} />
          <div className="mt-2 border-t border-neutral-200 pt-2">
            <Row label="Total" value={cart.totals.grandTotal} bold />
          </div>
        </dl>
      </aside>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className={bold ? 'font-semibold text-neutral-900' : 'text-neutral-600'}>{label}</dt>
      <dd className={bold ? 'font-semibold text-neutral-900' : 'text-neutral-900'}>{formatPrice(value)}</dd>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/storefront test -- checkout/CheckoutView`
Expected: PASS (4 cases).

- [ ] **Step 5: Write the gated `/checkout` page**

```typescript
// apps/storefront/src/app/checkout/page.tsx
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/session';
import { getCart, liveCartDeps, type CartView } from '@/lib/api-cart';
import { CheckoutView } from '@/components/checkout/CheckoutView';

export const metadata: Metadata = { title: 'Checkout' };

const EMPTY_CART: CartView = {
  id: '',
  items: [],
  totals: { subtotal: '0.00', discountTotal: '0.00', taxTotal: '0.00', shippingTotal: '0.00', grandTotal: '0.00' },
};

export default async function CheckoutPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let cart: CartView;
  try {
    cart = await getCart(await liveCartDeps());
  } catch {
    cart = EMPTY_CART;
  }
  if (cart.items.length === 0) redirect('/cart');

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">Checkout</h1>
      <CheckoutView cart={cart} />
    </main>
  );
}
```

- [ ] **Step 6: Build + lint + full test, then commit**

Run: `npm --prefix apps/storefront run build && npm --prefix apps/storefront run lint && npm --prefix apps/storefront test`
Expected: build clean (incl. `/checkout` route); lint clean; all tests green.

```bash
git add apps/storefront/src/app/checkout/ apps/storefront/src/components/checkout/
git commit -m "feat(storefront): /checkout page — order review + shipping form + place"
```

---

### Task 5: `/orders/[id]` confirmation page + OrderSummary

**Files:**
- Create: `apps/storefront/src/app/orders/[id]/page.tsx`
- Create: `apps/storefront/src/components/orders/OrderSummary.tsx`
- Create: `apps/storefront/src/components/orders/OrderSummary.test.tsx`

**Interfaces:**
- Consumes: `getCurrentUser` from `@/lib/session`; `getOrder` from `@/lib/api-orders`; `liveAuthedDeps` from `@/lib/api-authed`; `ApiAuthError` from `@/lib/api-auth`; `redirect`, `notFound` from `next/navigation`; `formatPrice` from `@/lib/money`; `type OrderView` from `@/lib/api-orders`.
- Produces: `function OrderSummary({ order }: { order: OrderView }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/storefront/src/components/orders/OrderSummary.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderSummary } from './OrderSummary';
import type { OrderView } from '@/lib/api-orders';

const order: OrderView = {
  id: 'order1',
  status: 'PENDING',
  subtotal: '39.98', discountTotal: '0.00', taxTotal: '4.00', shippingTotal: '5.00', grandTotal: '48.98',
  shipFullName: 'Ada Lovelace', shipLine1: '12 Analytical Way', shipLine2: null,
  shipCity: 'London', shipState: 'Greater London', shipCountry: 'UK', shipPostalCode: 'EC1A 1BB',
  items: [{ productId: 'p1', productName: 'Mouse', unitPrice: '19.99', quantity: 2, lineTotal: '39.98' }],
  createdAt: '2026-06-17T12:00:00.000Z',
};

describe('OrderSummary', () => {
  it('renders status, items, totals, and the shipping snapshot', () => {
    render(<OrderSummary order={order} />);
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
    expect(screen.getByText('Mouse')).toBeInTheDocument();
    expect(screen.getByText('$48.98')).toBeInTheDocument();       // grand total
    expect(screen.getByText(/ada lovelace/i)).toBeInTheDocument();
    expect(screen.getByText(/12 analytical way/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/storefront test -- orders/OrderSummary`
Expected: FAIL — cannot find module `./OrderSummary`.

- [ ] **Step 3: Write `OrderSummary.tsx`**

```typescript
// apps/storefront/src/components/orders/OrderSummary.tsx
import { formatPrice } from '@/lib/money';
import type { OrderView } from '@/lib/api-orders';

/** Presentational order detail — items, totals, shipping snapshot. Reusable by
 *  the order confirmation page and (later) order history. */
export function OrderSummary({ order }: { order: OrderView }) {
  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <div className="flex-1">
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm text-neutral-600">Status</span>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-900">
            {order.status}
          </span>
        </div>
        <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
          {order.items.map((item) => (
            <li key={item.productId} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span className="min-w-0 truncate text-neutral-900">
                {item.productName} × {item.quantity}
              </span>
              <span className="tabular-nums text-neutral-900">{formatPrice(item.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <h2 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-600">
          Shipping to
        </h2>
        <address className="not-italic text-sm text-neutral-900">
          {order.shipFullName}<br />
          {order.shipLine1}<br />
          {order.shipLine2 && <>{order.shipLine2}<br /></>}
          {order.shipCity}, {order.shipState} {order.shipPostalCode}<br />
          {order.shipCountry}
        </address>
      </div>

      <aside className="w-full shrink-0 rounded-lg border border-neutral-200 bg-neutral-0 p-6 lg:w-80">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-600">Summary</h2>
        <dl className="flex flex-col gap-2 text-sm">
          {/* discountTotal intentionally omitted — out of PRD scope (always 0.00) */}
          <Row label="Subtotal" value={order.subtotal} />
          <Row label="Tax" value={order.taxTotal} />
          <Row label="Shipping" value={order.shippingTotal} />
          <div className="mt-2 border-t border-neutral-200 pt-2">
            <Row label="Total" value={order.grandTotal} bold />
          </div>
        </dl>
      </aside>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className={bold ? 'font-semibold text-neutral-900' : 'text-neutral-600'}>{label}</dt>
      <dd className={bold ? 'font-semibold text-neutral-900' : 'text-neutral-900'}>{formatPrice(value)}</dd>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/storefront test -- orders/OrderSummary`
Expected: PASS.

- [ ] **Step 5: Write the gated `/orders/[id]` page**

```typescript
// apps/storefront/src/app/orders/[id]/page.tsx
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/session';
import { getOrder } from '@/lib/api-orders';
import { liveAuthedDeps } from '@/lib/api-authed';
import { ApiAuthError } from '@/lib/api-auth';
import { OrderSummary } from '@/components/orders/OrderSummary';

export const metadata: Metadata = { title: 'Order confirmation' };

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;

  let order;
  try {
    order = await getOrder(id, await liveAuthedDeps());
  } catch (err) {
    if (err instanceof ApiAuthError && err.status === 404) notFound();
    if (err instanceof ApiAuthError && err.status === 401) redirect('/login');
    throw err;
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-neutral-900">Order placed</h1>
        <p className="text-sm text-neutral-600">
          Thank you — your order <span className="font-medium text-neutral-900">{order.id}</span> has been received.
        </p>
      </header>
      <OrderSummary order={order} />
    </main>
  );
}
```

- [ ] **Step 6: Build + lint + full test, then commit**

Run: `npm --prefix apps/storefront run build && npm --prefix apps/storefront run lint && npm --prefix apps/storefront test`
Expected: build clean (incl. `/orders/[id]` route); lint clean; all tests green.

```bash
git add apps/storefront/src/app/orders/ apps/storefront/src/components/orders/
git commit -m "feat(storefront): /orders/[id] confirmation page + OrderSummary"
```

---

### Task 6: Gate `/checkout` and `/orders`

**Files:**
- Modify: `apps/storefront/src/lib/route-protection.ts`
- Modify: `apps/storefront/src/lib/route-protection.test.ts`
- Modify: `apps/storefront/src/proxy.ts`

**Interfaces:** none new (extends `PROTECTED_PREFIXES` + matcher).

- [ ] **Step 1: Add the failing test cases**

Append to `apps/storefront/src/lib/route-protection.test.ts` inside the existing `loginRedirectFor` describe:

```typescript
  it('redirects /checkout to /login when there is no session', () => {
    expect(loginRedirectFor('/checkout', false)).toBe('/login');
  });

  it('redirects /orders to /login when there is no session', () => {
    expect(loginRedirectFor('/orders/order1', false)).toBe('/login');
  });

  it('allows /checkout and /orders when a session is present', () => {
    expect(loginRedirectFor('/checkout', true)).toBeNull();
    expect(loginRedirectFor('/orders/order1', true)).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/storefront test -- route-protection`
Expected: FAIL — `/checkout` and `/orders` not protected yet.

- [ ] **Step 3: Add the prefixes**

In `apps/storefront/src/lib/route-protection.ts`:

```typescript
const PROTECTED_PREFIXES = ['/account', '/cart', '/checkout', '/orders'];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/storefront test -- route-protection`
Expected: PASS.

- [ ] **Step 5: Add the matcher entries**

In `apps/storefront/src/proxy.ts`, add to the `config.matcher` array (alongside the existing entries):

```typescript
    '/checkout',
    '/orders',
    '/orders/:path*',
```

- [ ] **Step 6: Lint + commit**

```bash
npm --prefix apps/storefront run lint && npm --prefix apps/storefront test -- route-protection
git add apps/storefront/src/lib/route-protection.ts apps/storefront/src/lib/route-protection.test.ts apps/storefront/src/proxy.ts
git commit -m "feat(storefront): gate /checkout and /orders behind authentication"
```

---

### Task 7: E2E smoke + manual verification + PLAN.md

**Files:**
- Create: `apps/storefront/e2e/checkout.spec.ts`
- Modify: `PLAN.md`

**Interfaces:** none (verification + docs). RULE.md §5 gate.

- [ ] **Step 1: Write the E2E spec (skips if API absent, mirroring `e2e/cart.spec.ts`)**

Read `apps/storefront/e2e/cart.spec.ts` first to copy its skip-guard + register/login + add-to-cart flow, then write `apps/storefront/e2e/checkout.spec.ts`:

```typescript
// apps/storefront/e2e/checkout.spec.ts
import { test, expect } from '@playwright/test';

test('redirects unauthenticated users away from /checkout', async ({ page }) => {
  await page.goto('/checkout');
  await expect(page).toHaveURL(/\/login$/);
});

test('place an order: cart → checkout → confirmation, badge resets', async ({ page, request }) => {
  const apiUrl = process.env.API_URL ?? 'http://localhost:5000';
  const apiUp = await request
    .post(`${apiUrl}/auth/login`, { data: { email: 'probe@none.test', password: 'x' }, failOnStatusCode: false })
    .then((r) => r.status() !== 0)
    .catch(() => false);
  test.skip(!apiUp, `API not reachable at ${apiUrl} — skipping live checkout flow`);

  const listed = await request.get(`${apiUrl}/products?status=ACTIVE&pageSize=1`);
  const firstId = (await listed.json())?.data?.[0]?.id as string | undefined;
  test.skip(!firstId, 'No ACTIVE product seeded — skipping checkout flow');

  // Register a fresh customer (auto-logs in).
  const email = `checkout-e2e+${Date.now()}@test.com`;
  await page.goto('/register');
  await page.getByLabel(/name/i).fill('Checkout E2E');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill('password123');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/$/);

  // Add a product, then go to checkout.
  await page.goto(`/products/${firstId}`);
  await page.getByRole('button', { name: /add to cart/i }).click();
  await expect(page.getByTestId('cart-count')).toHaveText('1');

  await page.goto('/checkout');
  await page.getByLabel(/full name/i).fill('Ada Lovelace');
  await page.getByLabel(/address line 1/i).fill('12 Analytical Way');
  await page.getByLabel(/city/i).fill('London');
  await page.getByLabel(/state/i).fill('Greater London');
  await page.getByLabel(/country/i).fill('UK');
  await page.getByLabel(/postal code/i).fill('EC1A 1BB');
  await page.getByRole('button', { name: /place order/i }).click();

  // Lands on the confirmation page.
  await expect(page).toHaveURL(/\/orders\/.+/);
  await expect(page.getByRole('heading', { name: /order placed/i })).toBeVisible();

  // Cart badge is gone (cart cleared).
  await expect(page.getByTestId('cart-count')).toHaveCount(0);
});
```

- [ ] **Step 2: Manual smoke vs `ecom_dev`**

Start the API + storefront, then exercise the flow (browser or the Playwright spec against live servers):

```bash
npm --prefix apps/api run start:dev        # :5000 vs ecom_dev
npm --prefix apps/storefront run dev       # :5001
```

Verify:
- Logged-out `/checkout` → `/login`.
- Log in, add a product, go to `/checkout`: order review shows the line + totals matching the cart.
- Submit with a blank required field → inline validation, no request.
- Fill shipping, Place order → lands on `/orders/<id>` showing "Order placed", items, totals, shipping; header badge is 0.
- Back to `/checkout` → redirected to `/cart` (now empty).
- Open the order id while logged in as a DIFFERENT customer → 404.
- Run `npm --prefix apps/storefront run test:e2e -- checkout.spec` → passes (or skips cleanly without a backend).

Finalize the E2E selectors against the running app and re-run until green.

- [ ] **Step 3: Update PLAN.md**

- Flip the Phase 4 storefront line to fully done: `Storefront: cart (add/remove/update/totals) ✅, checkout (...) ✅`. Mark the **Exit** line `- [x] **Exit:** customer can build a cart and place an order; totals match between cart and review.` ✅
- Set the Phase 4 status table row to `✅ Done`.
- Append a Phase 4 status note (mirroring prior slice notes): checkout components shipped (`lib/api-authed` shared core, `lib/api-orders`, `app/api/orders` handler, `/checkout` page + `CheckoutView`, `/orders/[id]` + `OrderSummary`, gating), the data path, store-reset-on-place, test counts, and the manual + E2E smoke result vs `ecom_dev`. Branch `feat/storefront-checkout`. Note **Phase 4 complete**.
- Per RULE.md §6 (phase completion), this is the point to produce a resume prompt — that happens in the §6 handoff after verification, not in this commit.

- [ ] **Step 4: Commit**

```bash
git add apps/storefront/e2e/checkout.spec.ts PLAN.md
git commit -m "test(storefront): checkout E2E; docs(phase4): checkout slice done, Phase 4 complete"
```

---

## Self-Review

**1. Spec coverage:**
- Shared authed-request core extracted (`api-authed.ts`), cart consumes it, behavior-preserving → Task 1. ✅
- `lib/api-orders.ts` (placeOrder, getOrder) → Task 2. ✅
- `POST /api/orders` route handler (injectable) → Task 3. ✅
- Gated `/checkout` page (empty cart → /cart) + CheckoutView (review + form + place; success resets store + redirects; 400 inline; 401 → /login) → Task 4. ✅
- `/orders/[id]` gated confirmation (404 → notFound) + reusable OrderSummary → Task 5. ✅
- `/checkout` + `/orders` route protection → Task 6. ✅
- Totals from API envelopes via `formatPrice`, no client arithmetic → Tasks 4/5 components. ✅
- Tests (api-authed, api-orders, orders handlers, CheckoutView, OrderSummary, route-protection) + E2E → Tasks 1–7. ✅
- Store reset via `hydrate(empty)` → Task 4. ✅
- Out-of-scope (payment, order history list, saved-address, cart editing on checkout) → not built. ✅

**2. Placeholder scan:** Every code step has complete code; every test asserts concrete values; every command has expected output. The E2E selectors are finalized against the live app in Task 7 Step 2 — the one legitimate "finalize during run" (selectors depend on seeded ids), with the skip-guard requirement explicit.

**3. Type consistency:** `AuthedApiDeps`/`authedRequest`/`liveAuthedDeps` (Task 1) consumed by `api-cart` (Task 1), `api-orders` (Task 2), orders route-deps (Task 3), and the `/orders/[id]` page (Task 5). `CartApiDeps`/`liveCartDeps` aliases keep `app/api/cart/route-deps.ts` working (Task 1). `OrderView`/`OrderItemView`/`CheckoutInput` (Task 2) consumed by orders handlers (Task 3), CheckoutView's result shape (Task 4), OrderSummary + the confirmation page (Task 5). `handlePlaceOrder`/`OrdersRouteDeps` (Task 3) used by `route.ts`. `CheckoutView({ cart })` (Task 4) and `OrderSummary({ order })` (Task 5) signatures match their page mounts. The store reset uses `hydrate` (already on `CartContextValue`). Endpoint paths (`/api/orders`) match between CheckoutView's fetch (Task 4) and the route file (Task 3). ✅
