# Storefront Cart UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer-facing cart UI — `/cart` page (view/update/remove/clear with live API totals), an Add-to-cart button on the product detail page, and a live count badge on the header — consuming the slice-1 cart API through Next Route Handlers, gated to logged-in customers.

**Architecture:** Mirror the storefront's established auth pattern: a server-only typed API client (`lib/api-cart.ts`) with refresh-on-401, Route Handlers under `app/api/cart/*` (logic in an injectable `handlers.ts`), and client components that `fetch` those handlers. A root-layout `CartProvider` holds authoritative cart state (replaced by the API envelope after each mutation, no optimism); a `CartCountBadge` client island reads it over the existing server-rendered header. `/cart` is gated like `/account`.

**Tech Stack:** Next.js (App Router, RSC) + TypeScript, Tailwind v4, Vitest + RTL, Playwright. Consumes `apps/api` `/cart` endpoints.

**Spec:** `docs/superpowers/specs/2026-06-17-storefront-cart-ui-design.md`

## Global Constraints

- Strict TypeScript; no `any`. Functional components + hooks.
- **Never compute prices/totals client-side** — render the API's strings verbatim (use `lib/money.ts` display helpers + the existing `components/catalog/Price.tsx`).
- Authed API calls go through Next Route Handlers that read the httpOnly `sf_access`/`sf_refresh` cookies and proxy server-side — the browser never sees tokens. Mirror `lib/api-auth.ts` (`ApiAuthError`, `request<T>`, `messageFrom`, injectable `opts`) and `lib/session.ts` (`resolveSession` refresh-on-401, `ACCESS_COOKIE`/`REFRESH_COOKIE`, `cookieOptions`, `setSession`/`clearSession`).
- `lib/api-cart.ts` and `app/api/cart/route-deps.ts` are **server-only** (`import 'server-only'`). Client components never import them.
- Vitest can't resolve `server-only`/`next/headers` — those are aliased to stubs in `src/test/` (already configured in `vitest.config.ts`). Keep server-only logic in injectable functions tested with stub deps (mirror `handlers.test.ts`).
- Cart totals/money are 2-dp strings from the API. The CartView contract mirrors the API: `{ id, items: [{ productId, name, unitPrice, quantity, lineTotal, image }], totals: { subtotal, discountTotal, taxTotal, shippingTotal, grandTotal } }`.
- Accessibility: semantic HTML, keyboard-operable qty steppers, focus-visible rings (match existing components), never color-only state.
- `/cart` is CUSTOMER-gated: `proxy.ts` redirects to `/login` on missing session cookie; the page re-verifies via `getCurrentUser()`.
- Fixed dev ports: storefront `:5001`, API `:5000`. Storefront→API base from `apiBaseUrl()` (`API_URL`, default `http://localhost:5000`).
- Shell cwd resets between tool calls — use `npm --prefix apps/storefront ...`. Branch `feat/storefront-cart-ui` (already created, spec committed). Commit per task; trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Commands: test `npm --prefix apps/storefront test`; single `npm --prefix apps/storefront test -- <pattern>`; lint `npm --prefix apps/storefront run lint`; build `npm --prefix apps/storefront run build`.

## File Structure

```
apps/storefront/src/
  lib/
    api-cart.ts            # NEW (Task 1) — server-only cart API client + refresh-on-401
    api-cart.test.ts       # NEW (Task 1)
    route-protection.ts    # MODIFIED (Task 5) — add '/cart' to PROTECTED_PREFIXES
  app/
    api/cart/
      handlers.ts          # NEW (Task 2) — injectable route-handler logic
      handlers.test.ts     # NEW (Task 2)
      route-deps.ts        # NEW (Task 2) — liveCartRouteDeps()
      route.ts             # NEW (Task 2) — GET /api/cart, DELETE /api/cart
      items/route.ts       # NEW (Task 2) — POST /api/cart/items
      items/[productId]/route.ts  # NEW (Task 2) — PATCH/DELETE /api/cart/items/:productId
    cart/page.tsx          # NEW (Task 4) — gated SSR cart page
  components/cart/
    CartProvider.tsx       # NEW (Task 3) — context + useCart()
    CartProvider.test.tsx  # NEW (Task 3)
    CartCountBadge.tsx     # NEW (Task 3) — header client island
    CartCountBadge.test.tsx# NEW (Task 3)
    CartContents.tsx       # NEW (Task 4) — line list + totals + empty state
    CartContents.test.tsx  # NEW (Task 4)
    AddToCartButton.tsx    # NEW (Task 4) — product-page button
    AddToCartButton.test.tsx # NEW (Task 4)
  app/layout.tsx           # MODIFIED (Task 3) — mount CartProvider, seed initial cart
  components/layout/SiteHeaderView.tsx  # MODIFIED (Task 3) — render CartCountBadge over CartIcon
  app/products/[id]/page.tsx            # MODIFIED (Task 4) — mount AddToCartButton
  proxy.ts                 # MODIFIED (Task 5) — add '/cart' to matcher
  e2e/cart.spec.ts         # NEW (Task 6)
```

---

### Task 1: `lib/api-cart.ts` — server-only cart API client with refresh-on-401

**Files:**
- Create: `apps/storefront/src/lib/api-cart.ts`
- Create: `apps/storefront/src/lib/api-cart.test.ts`

**Interfaces:**
- Consumes: `ApiAuthError`, `refresh`, `type TokenPair` from `./api-auth`; `apiBaseUrl` from `./env` (live deps only).
- Produces:
  - `interface CartItemView { productId; name; unitPrice; quantity; lineTotal; image: string | null }`
  - `interface CartTotals { subtotal; discountTotal; taxTotal; shippingTotal; grandTotal }` (all string)
  - `interface CartView { id: string; items: CartItemView[]; totals: CartTotals }`
  - `interface CartApiDeps { baseUrl; getAccessToken(): string | undefined; getRefreshToken(): string | undefined; onTokensRefreshed(pair: TokenPair): void | Promise<void>; onSessionInvalid(): void | Promise<void>; fetch?: typeof fetch }`
  - `async function cartRequest<T>(path: string, init: RequestInit, deps: CartApiDeps): Promise<T>`
  - `getCart(deps)`, `addItem(productId, quantity, deps)`, `setItemQuantity(productId, quantity, deps)`, `removeItem(productId, deps)`, `clearCart(deps)` — all `Promise<CartView>`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/storefront/src/lib/api-cart.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  cartRequest,
  getCart,
  addItem,
  type CartApiDeps,
  type CartView,
} from './api-cart';
import { ApiAuthError } from './api-auth';

const envelope: CartView = {
  id: 'cart1',
  items: [
    { productId: 'p1', name: 'Mouse', unitPrice: '19.99', quantity: 2, lineTotal: '39.98', image: null },
  ],
  totals: { subtotal: '39.98', discountTotal: '0.00', taxTotal: '4.00', shippingTotal: '5.00', grandTotal: '48.98' },
};

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;
const errResponse = (status: number, body: unknown) =>
  ({ ok: false, status, json: async () => body }) as Response;

const baseDeps = (over: Partial<CartApiDeps> = {}): CartApiDeps => ({
  baseUrl: 'http://api.test',
  getAccessToken: () => 'access-1',
  getRefreshToken: () => 'refresh-1',
  onTokensRefreshed: vi.fn(),
  onSessionInvalid: vi.fn(),
  fetch: vi.fn(),
  ...over,
});

describe('cartRequest', () => {
  it('calls the API with the bearer token and returns the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(envelope));
    const deps = baseDeps({ fetch: fetchMock });

    const res = await getCart(deps);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/cart',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ authorization: 'Bearer access-1' }),
      }),
    );
    expect(res).toEqual(envelope);
  });

  it('POSTs add-item with productId + quantity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(envelope));
    const deps = baseDeps({ fetch: fetchMock });

    await addItem('p1', 2, deps);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/cart/items');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ productId: 'p1', quantity: 2 });
  });

  it('refreshes once on 401 then retries with the new token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(okResponse(envelope));
    // refresh() is called via deps; stub the refresh path through onTokensRefreshed
    const onTokensRefreshed = vi.fn();
    const deps = baseDeps({
      fetch: fetchMock,
      onTokensRefreshed,
      // inject a refresh function via the live wiring? No — cartRequest calls api-auth.refresh.
      // To keep this unit pure, refresh is injected; see implementation note.
      refresh: vi.fn().mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2' }),
    } as Partial<CartApiDeps>);

    const res = await getCart(deps);

    // second fetch used the refreshed token
    const secondInit = fetchMock.mock.calls[1][1];
    expect(secondInit.headers.authorization).toBe('Bearer access-2');
    expect(onTokensRefreshed).toHaveBeenCalledWith({ accessToken: 'access-2', refreshToken: 'refresh-2' });
    expect(res).toEqual(envelope);
  });

  it('invalidates the session when refresh fails on 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(401, { message: 'expired' }));
    const onSessionInvalid = vi.fn();
    const deps = baseDeps({
      fetch: fetchMock,
      onSessionInvalid,
      refresh: vi.fn().mockRejectedValue(new ApiAuthError('bad', 401)),
    } as Partial<CartApiDeps>);

    await expect(getCart(deps)).rejects.toBeInstanceOf(ApiAuthError);
    expect(onSessionInvalid).toHaveBeenCalled();
  });

  it('flattens an array message from the API error body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(400, { message: ['a', 'b'] }));
    const deps = baseDeps({ fetch: fetchMock, getAccessToken: () => 'access-1', getRefreshToken: () => undefined });

    await expect(getCart(deps)).rejects.toMatchObject({ status: 400, message: 'a, b' });
  });
});
```

> **Implementation note (read before Step 3):** to keep `cartRequest` unit-pure, the refresh function is part of `CartApiDeps` as an optional `refresh?(refreshToken: string): Promise<TokenPair>`. The live deps bind it to `api-auth.refresh`; tests inject a stub. Add `refresh?` to the `CartApiDeps` interface.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/storefront test -- api-cart`
Expected: FAIL — cannot find module `./api-cart`.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/storefront/src/lib/api-cart.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/storefront test -- api-cart`
Expected: PASS (5 cases).

- [ ] **Step 5: Lint + commit**

```bash
npm --prefix apps/storefront run lint
git add apps/storefront/src/lib/api-cart.ts apps/storefront/src/lib/api-cart.test.ts
git commit -m "feat(storefront): server-only cart API client with refresh-on-401"
```

---

### Task 2: Route Handlers (`app/api/cart/*`)

**Files:**
- Create: `apps/storefront/src/app/api/cart/handlers.ts`
- Create: `apps/storefront/src/app/api/cart/handlers.test.ts`
- Create: `apps/storefront/src/app/api/cart/route-deps.ts`
- Create: `apps/storefront/src/app/api/cart/route.ts`
- Create: `apps/storefront/src/app/api/cart/items/route.ts`
- Create: `apps/storefront/src/app/api/cart/items/[productId]/route.ts`

**Interfaces:**
- Consumes: `getCart`, `addItem`, `setItemQuantity`, `removeItem`, `clearCart`, `liveCartDeps`, `type CartView` from `@/lib/api-cart`; `ApiAuthError` from `@/lib/api-auth`.
- Produces:
  - `interface CartHandlerResult { status: number; body: unknown }`
  - `interface CartRouteDeps { getCart(): Promise<CartView>; addItem(productId, quantity): Promise<CartView>; setItemQuantity(productId, quantity): Promise<CartView>; removeItem(productId): Promise<CartView>; clearCart(): Promise<CartView> }`
  - `handleGetCart(deps)`, `handleAddItem(input, deps)`, `handleSetQuantity(productId, input, deps)`, `handleRemoveItem(productId, deps)`, `handleClearCart(deps)` — all `Promise<CartHandlerResult>`.
  - `liveCartRouteDeps(): CartRouteDeps`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/storefront/src/app/api/cart/handlers.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  handleGetCart,
  handleAddItem,
  handleSetQuantity,
  type CartRouteDeps,
} from './handlers';
import { ApiAuthError } from '@/lib/api-auth';
import type { CartView } from '@/lib/api-cart';

const envelope: CartView = {
  id: 'c1',
  items: [],
  totals: { subtotal: '0.00', discountTotal: '0.00', taxTotal: '0.00', shippingTotal: '0.00', grandTotal: '0.00' },
};

const deps = (over: Partial<CartRouteDeps> = {}): CartRouteDeps => ({
  getCart: vi.fn().mockResolvedValue(envelope),
  addItem: vi.fn().mockResolvedValue(envelope),
  setItemQuantity: vi.fn().mockResolvedValue(envelope),
  removeItem: vi.fn().mockResolvedValue(envelope),
  clearCart: vi.fn().mockResolvedValue(envelope),
  ...over,
});

describe('cart handlers', () => {
  it('handleGetCart returns 200 + envelope', async () => {
    const res = await handleGetCart(deps());
    expect(res).toEqual({ status: 200, body: envelope });
  });

  it('handleAddItem validates productId + integer quantity', async () => {
    const res = await handleAddItem({ productId: '', quantity: 1 }, deps());
    expect(res.status).toBe(400);
  });

  it('handleAddItem passes through and returns the envelope', async () => {
    const d = deps();
    const res = await handleAddItem({ productId: 'p1', quantity: 2 }, d);
    expect(d.addItem).toHaveBeenCalledWith('p1', 2);
    expect(res).toEqual({ status: 200, body: envelope });
  });

  it('maps an ApiAuthError to its status + message', async () => {
    const d = deps({ getCart: vi.fn().mockRejectedValue(new ApiAuthError('Product is not available for purchase', 400)) });
    const res = await handleGetCart(d);
    expect(res).toEqual({ status: 400, body: { message: 'Product is not available for purchase' } });
  });

  it('handleSetQuantity rejects a negative quantity with 400', async () => {
    const res = await handleSetQuantity('p1', { quantity: -1 }, deps());
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/storefront test -- cart/handlers`
Expected: FAIL — cannot find module `./handlers`.

- [ ] **Step 3: Write `handlers.ts`**

```typescript
// apps/storefront/src/app/api/cart/handlers.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/storefront test -- cart/handlers`
Expected: PASS (5 cases).

- [ ] **Step 5: Write `route-deps.ts`**

```typescript
// apps/storefront/src/app/api/cart/route-deps.ts
import 'server-only';
import {
  getCart as apiGetCart,
  addItem as apiAddItem,
  setItemQuantity as apiSetQuantity,
  removeItem as apiRemoveItem,
  clearCart as apiClearCart,
  liveCartDeps,
} from '@/lib/api-cart';
import type { CartRouteDeps } from './handlers';

/** Production wiring: each op resolves cookie-bound cart deps, then calls the API. */
export function liveCartRouteDeps(): CartRouteDeps {
  return {
    getCart: async () => apiGetCart(await liveCartDeps()),
    addItem: async (productId, quantity) => apiAddItem(productId, quantity, await liveCartDeps()),
    setItemQuantity: async (productId, quantity) => apiSetQuantity(productId, quantity, await liveCartDeps()),
    removeItem: async (productId) => apiRemoveItem(productId, await liveCartDeps()),
    clearCart: async () => apiClearCart(await liveCartDeps()),
  };
}
```

- [ ] **Step 6: Write the route files**

```typescript
// apps/storefront/src/app/api/cart/route.ts
import { NextResponse } from 'next/server';
import { handleGetCart, handleClearCart } from './handlers';
import { liveCartRouteDeps } from './route-deps';

export async function GET() {
  const result = await handleGetCart(liveCartRouteDeps());
  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE() {
  const result = await handleClearCart(liveCartRouteDeps());
  return NextResponse.json(result.body, { status: result.status });
}
```

```typescript
// apps/storefront/src/app/api/cart/items/route.ts
import { NextResponse } from 'next/server';
import { handleAddItem } from '../handlers';
import { liveCartRouteDeps } from '../route-deps';

export async function POST(req: Request) {
  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handleAddItem(
    { productId: input.productId, quantity: input.quantity },
    liveCartRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
```

```typescript
// apps/storefront/src/app/api/cart/items/[productId]/route.ts
import { NextResponse } from 'next/server';
import { handleSetQuantity, handleRemoveItem } from '../../handlers';
import { liveCartRouteDeps } from '../../route-deps';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handleSetQuantity(productId, { quantity: input.quantity }, liveCartRouteDeps());
  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  const result = await handleRemoveItem(productId, liveCartRouteDeps());
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 7: Lint + build + commit**

```bash
npm --prefix apps/storefront run lint && npm --prefix apps/storefront run build
git add apps/storefront/src/app/api/cart/
git commit -m "feat(storefront): /api/cart route handlers proxying the cart API"
```

---

### Task 3: CartProvider + useCart + CartCountBadge + layout/header wiring

**Files:**
- Create: `apps/storefront/src/components/cart/CartProvider.tsx`
- Create: `apps/storefront/src/components/cart/CartProvider.test.tsx`
- Create: `apps/storefront/src/components/cart/CartCountBadge.tsx`
- Create: `apps/storefront/src/components/cart/CartCountBadge.test.tsx`
- Modify: `apps/storefront/src/app/layout.tsx`
- Modify: `apps/storefront/src/components/layout/SiteHeaderView.tsx`

**Interfaces:**
- Consumes: `type CartView` from `@/lib/api-cart`; `useRouter` from `next/navigation`.
- Produces:
  - `interface CartContextValue { cart: CartView | null; itemCount: number; pending: boolean; error: string | null; add(productId: string, quantity?: number): Promise<void>; setQuantity(productId: string, quantity: number): Promise<void>; remove(productId: string): Promise<void>; clear(): Promise<void>; hydrate(cart: CartView): void }`
  - `function CartProvider({ initialCart, children }: { initialCart: CartView | null; children: React.ReactNode }): JSX.Element`
  - `function useCart(): CartContextValue`
  - `function CartCountBadge(): JSX.Element | null`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/storefront/src/components/cart/CartProvider.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CartProvider, useCart } from './CartProvider';
import type { CartView } from '@/lib/api-cart';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const cart = (qty: number): CartView => ({
  id: 'c1',
  items: qty ? [{ productId: 'p1', name: 'M', unitPrice: '5.00', quantity: qty, lineTotal: (5 * qty).toFixed(2), image: null }] : [],
  totals: { subtotal: '0.00', discountTotal: '0.00', taxTotal: '0.00', shippingTotal: '0.00', grandTotal: '0.00' },
});

function Probe() {
  const { itemCount, add } = useCart();
  return (
    <div>
      <span data-testid="count">{itemCount}</span>
      <button onClick={() => void add('p1', 2)}>add</button>
    </div>
  );
}

beforeEach(() => {
  pushMock.mockReset();
  global.fetch = vi.fn();
});

describe('CartProvider', () => {
  it('derives itemCount from the initial cart', () => {
    render(
      <CartProvider initialCart={cart(3)}>
        <Probe />
      </CartProvider>,
    );
    expect(screen.getByTestId('count').textContent).toBe('3');
  });

  it('replaces state with the API envelope after an action', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => cart(5),
    });
    render(
      <CartProvider initialCart={cart(0)}>
        <Probe />
      </CartProvider>,
    );
    await act(async () => {
      screen.getByText('add').click();
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/cart/items', expect.objectContaining({ method: 'POST' }));
    expect(screen.getByTestId('count').textContent).toBe('5');
  });

  it('redirects to /login when an action returns 401', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Session expired' }),
    });
    render(
      <CartProvider initialCart={cart(0)}>
        <Probe />
      </CartProvider>,
    );
    await act(async () => {
      screen.getByText('add').click();
    });
    expect(pushMock).toHaveBeenCalledWith('/login');
  });
});
```

```typescript
// apps/storefront/src/components/cart/CartCountBadge.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CartProvider } from './CartProvider';
import { CartCountBadge } from './CartCountBadge';
import type { CartView } from '@/lib/api-cart';

const cart = (qty: number): CartView => ({
  id: 'c1',
  items: qty ? [{ productId: 'p1', name: 'M', unitPrice: '5.00', quantity: qty, lineTotal: '5.00', image: null }] : [],
  totals: { subtotal: '0.00', discountTotal: '0.00', taxTotal: '0.00', shippingTotal: '0.00', grandTotal: '0.00' },
});

describe('CartCountBadge', () => {
  it('shows the count when items exist', () => {
    render(<CartProvider initialCart={cart(2)}><CartCountBadge /></CartProvider>);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders nothing when the cart is empty', () => {
    const { container } = render(<CartProvider initialCart={cart(0)}><CartCountBadge /></CartProvider>);
    expect(container.querySelector('[data-testid="cart-count"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix apps/storefront test -- cart/CartProvider cart/CartCountBadge`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `CartProvider.tsx`**

```typescript
// apps/storefront/src/components/cart/CartProvider.tsx
'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CartView } from '@/lib/api-cart';

export interface CartContextValue {
  cart: CartView | null;
  itemCount: number;
  pending: boolean;
  error: string | null;
  add(productId: string, quantity?: number): Promise<void>;
  setQuantity(productId: string, quantity: number): Promise<void>;
  remove(productId: string): Promise<void>;
  clear(): Promise<void>;
  hydrate(cart: CartView): void;
}

const CartContext = createContext<CartContextValue | null>(null);

interface ErrorBody {
  message?: string;
}

export function CartProvider({
  initialCart,
  children,
}: {
  initialCart: CartView | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [cart, setCart] = useState<CartView | null>(initialCart);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (endpoint: string, init: RequestInit) => {
      setPending(true);
      setError(null);
      try {
        const res = await fetch(endpoint, {
          ...init,
          headers: { 'content-type': 'application/json', ...init.headers },
        });
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        const body = (await res.json().catch(() => null)) as CartView | ErrorBody | null;
        if (!res.ok) {
          setError((body as ErrorBody)?.message ?? 'Unable to update cart.');
          return;
        }
        setCart(body as CartView);
      } catch {
        setError('Unable to reach the server. Please try again.');
      } finally {
        setPending(false);
      }
    },
    [router],
  );

  const value = useMemo<CartContextValue>(() => {
    const itemCount = cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;
    return {
      cart,
      itemCount,
      pending,
      error,
      add: (productId, quantity = 1) =>
        run('/api/cart/items', { method: 'POST', body: JSON.stringify({ productId, quantity }) }),
      setQuantity: (productId, quantity) =>
        run(`/api/cart/items/${encodeURIComponent(productId)}`, { method: 'PATCH', body: JSON.stringify({ quantity }) }),
      remove: (productId) =>
        run(`/api/cart/items/${encodeURIComponent(productId)}`, { method: 'DELETE' }),
      clear: () => run('/api/cart', { method: 'DELETE' }),
      hydrate: (next) => setCart(next),
    };
  }, [cart, pending, error, run]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
```

- [ ] **Step 4: Write `CartCountBadge.tsx`**

```typescript
// apps/storefront/src/components/cart/CartCountBadge.tsx
'use client';

import { useCart } from './CartProvider';

/** Small badge over the header cart icon; hidden when the cart is empty. */
export function CartCountBadge() {
  const { itemCount } = useCart();
  if (itemCount <= 0) return null;
  return (
    <span
      data-testid="cart-count"
      aria-label={`${itemCount} item${itemCount === 1 ? '' : 's'} in cart`}
      className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary-500 px-1.5 text-xs font-semibold text-neutral-0"
    >
      {itemCount}
    </span>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm --prefix apps/storefront test -- cart/CartProvider cart/CartCountBadge`
Expected: PASS.

- [ ] **Step 6: Mount the provider in the root layout (seeded from server)**

Modify `apps/storefront/src/app/layout.tsx`: read an initial cart snapshot server-side and wrap the body in `CartProvider`. Add imports and a helper:

```typescript
// add imports
import { CartProvider } from "@/components/cart/CartProvider";
import { getCurrentUser } from "@/lib/session";
import { getCart, liveCartDeps, type CartView } from "@/lib/api-cart";

// helper above RootLayout: read the cart for a logged-in user, else null.
async function readInitialCart(): Promise<CartView | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    return await getCart(await liveCartDeps());
  } catch {
    return null;
  }
}
```

Make `RootLayout` async and wrap:

```typescript
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const initialCart = await readInitialCart();
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <CartProvider initialCart={initialCart}>
          <SiteHeader />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </CartProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Render the badge over the header cart icon**

Modify `apps/storefront/src/components/layout/SiteHeaderView.tsx`: import `CartCountBadge`, make the `/cart` `Link` `relative`, and render the badge inside it. Replace the existing cart `Link` block:

```tsx
import { CartCountBadge } from '@/components/cart/CartCountBadge';
// ...
<Link
  href="/cart"
  className="relative rounded-md p-2 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
>
  <CartIcon />
  <CartCountBadge />
  <span className="sr-only">Cart</span>
</Link>
```

- [ ] **Step 8: Build + lint + full test, then commit**

Run: `npm --prefix apps/storefront run build && npm --prefix apps/storefront run lint && npm --prefix apps/storefront test`
Expected: build clean (layout is a valid async Server Component; `CartProvider` is a client component imported into it — allowed); lint clean; all tests green.

```bash
git add apps/storefront/src/components/cart/CartProvider.tsx apps/storefront/src/components/cart/CartProvider.test.tsx apps/storefront/src/components/cart/CartCountBadge.tsx apps/storefront/src/components/cart/CartCountBadge.test.tsx apps/storefront/src/app/layout.tsx apps/storefront/src/components/layout/SiteHeaderView.tsx
git commit -m "feat(storefront): cart context store + header count badge"
```

---

### Task 4: Cart page + CartContents + AddToCartButton

**Files:**
- Create: `apps/storefront/src/app/cart/page.tsx`
- Create: `apps/storefront/src/components/cart/CartContents.tsx`
- Create: `apps/storefront/src/components/cart/CartContents.test.tsx`
- Create: `apps/storefront/src/components/cart/AddToCartButton.tsx`
- Create: `apps/storefront/src/components/cart/AddToCartButton.test.tsx`
- Modify: `apps/storefront/src/app/products/[id]/page.tsx`

**Interfaces:**
- Consumes: `useCart` from `./CartProvider`; `type CartView` from `@/lib/api-cart`; `formatPrice` from `@/lib/money`; `getCurrentUser` from `@/lib/session`; `getCart`, `liveCartDeps` from `@/lib/api-cart`.
- Produces:
  - `function CartContents({ initial }: { initial: CartView }): JSX.Element`
  - `function AddToCartButton({ productId, disabled }: { productId: string; disabled?: boolean }): JSX.Element`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/storefront/src/components/cart/CartContents.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CartProvider } from './CartProvider';
import { CartContents } from './CartContents';
import type { CartView } from '@/lib/api-cart';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const full: CartView = {
  id: 'c1',
  items: [{ productId: 'p1', name: 'Mouse', unitPrice: '19.99', quantity: 2, lineTotal: '39.98', image: null }],
  totals: { subtotal: '39.98', discountTotal: '0.00', taxTotal: '4.00', shippingTotal: '5.00', grandTotal: '48.98' },
};
const empty: CartView = { id: 'c1', items: [], totals: full.totals };

const renderWith = (initial: CartView) =>
  render(<CartProvider initialCart={initial}><CartContents initial={initial} /></CartProvider>);

describe('CartContents', () => {
  it('renders line items and the grand total from the envelope', () => {
    renderWith(full);
    expect(screen.getByText('Mouse')).toBeInTheDocument();
    expect(screen.getByText('$48.98')).toBeInTheDocument(); // grand total
  });

  it('shows the empty state with a link to products when there are no items', () => {
    renderWith(empty);
    expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse products|continue shopping/i })).toHaveAttribute('href', '/products');
  });

  it('renders a checkout link to /checkout when items exist', () => {
    renderWith(full);
    expect(screen.getByRole('link', { name: /checkout/i })).toHaveAttribute('href', '/checkout');
  });
});
```

```typescript
// apps/storefront/src/components/cart/AddToCartButton.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CartProvider } from './CartProvider';
import { AddToCartButton } from './AddToCartButton';
import type { CartView } from '@/lib/api-cart';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const cart: CartView = {
  id: 'c1', items: [], totals: { subtotal: '0.00', discountTotal: '0.00', taxTotal: '0.00', shippingTotal: '0.00', grandTotal: '0.00' },
};

beforeEach(() => { global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => cart }); });

describe('AddToCartButton', () => {
  it('calls the add endpoint with the product id', async () => {
    render(<CartProvider initialCart={cart}><AddToCartButton productId="p1" /></CartProvider>);
    await act(async () => { screen.getByRole('button', { name: /add to cart/i }).click(); });
    expect(global.fetch).toHaveBeenCalledWith('/api/cart/items', expect.objectContaining({ method: 'POST' }));
  });

  it('is disabled when the product is unavailable', () => {
    render(<CartProvider initialCart={cart}><AddToCartButton productId="p1" disabled /></CartProvider>);
    expect(screen.getByRole('button', { name: /add to cart|unavailable/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix apps/storefront test -- cart/CartContents cart/AddToCartButton`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `CartContents.tsx`**

```typescript
// apps/storefront/src/components/cart/CartContents.tsx
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { formatPrice } from '@/lib/money';
import { useCart } from './CartProvider';
import type { CartView } from '@/lib/api-cart';

/** Client cart view, seeded by the server-rendered page via hydrate(). */
export function CartContents({ initial }: { initial: CartView }) {
  const { cart, pending, error, setQuantity, remove, clear, hydrate } = useCart();

  // Load the full SSR cart into the shared store on mount.
  useEffect(() => {
    hydrate(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = cart ?? initial;

  if (view.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-lg text-neutral-600">Your cart is empty.</p>
        <Link href="/products" className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-neutral-0 hover:bg-primary-600">
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <ul className="flex-1 divide-y divide-neutral-200 border-y border-neutral-200">
        {view.items.map((item) => (
          <li key={item.productId} className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-neutral-900">{item.name}</p>
              <p className="text-sm text-neutral-600">{formatPrice(item.unitPrice)} each</p>
            </div>
            <div className="flex items-center gap-2" role="group" aria-label={`Quantity for ${item.name}`}>
              <button
                type="button"
                aria-label={`Decrease quantity of ${item.name}`}
                disabled={pending}
                onClick={() => void setQuantity(item.productId, item.quantity - 1)}
                className="h-8 w-8 rounded-md border border-neutral-300 text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
              >
                −
              </button>
              <span className="w-8 text-center tabular-nums">{item.quantity}</span>
              <button
                type="button"
                aria-label={`Increase quantity of ${item.name}`}
                disabled={pending}
                onClick={() => void setQuantity(item.productId, item.quantity + 1)}
                className="h-8 w-8 rounded-md border border-neutral-300 text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
              >
                +
              </button>
            </div>
            <p className="w-20 text-right font-medium tabular-nums text-neutral-900">{formatPrice(item.lineTotal)}</p>
            <button
              type="button"
              aria-label={`Remove ${item.name}`}
              disabled={pending}
              onClick={() => void remove(item.productId)}
              className="text-sm text-error-500 hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <aside className="w-full shrink-0 rounded-lg border border-neutral-200 bg-neutral-0 p-6 lg:w-80">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-600">Order summary</h2>
        <dl className="flex flex-col gap-2 text-sm">
          <Row label="Subtotal" value={view.totals.subtotal} />
          <Row label="Tax" value={view.totals.taxTotal} />
          <Row label="Shipping" value={view.totals.shippingTotal} />
          <div className="mt-2 border-t border-neutral-200 pt-2">
            <Row label="Total" value={view.totals.grandTotal} bold />
          </div>
        </dl>
        {error && <p className="mt-3 text-sm text-error-500">{error}</p>}
        <Link
          href="/checkout"
          className="mt-6 block rounded-md bg-primary-500 px-4 py-2.5 text-center text-sm font-medium text-neutral-0 hover:bg-primary-600"
        >
          Proceed to checkout
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={() => { if (confirm('Clear your cart?')) void clear(); }}
          className="mt-2 block w-full text-center text-sm text-neutral-600 hover:underline disabled:opacity-50"
        >
          Clear cart
        </button>
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

- [ ] **Step 4: Write `AddToCartButton.tsx`**

```typescript
// apps/storefront/src/components/cart/AddToCartButton.tsx
'use client';

import { useState } from 'react';
import { useCart } from './CartProvider';

/** Adds one of `productId` to the cart. Logged-out → the store routes to /login. */
export function AddToCartButton({ productId, disabled }: { productId: string; disabled?: boolean }) {
  const { add, pending } = useCart();
  const [added, setAdded] = useState(false);

  async function onClick() {
    await add(productId);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() => void onClick()}
      className="mt-2 inline-flex w-fit items-center justify-center rounded-md bg-primary-500 px-5 py-2.5 text-sm font-medium text-neutral-0 transition-colors hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50"
    >
      {disabled ? 'Unavailable' : added ? 'Added ✓' : 'Add to cart'}
    </button>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm --prefix apps/storefront test -- cart/CartContents cart/AddToCartButton`
Expected: PASS.

- [ ] **Step 6: Write the gated cart page**

```typescript
// apps/storefront/src/app/cart/page.tsx
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/session';
import { getCart, liveCartDeps } from '@/lib/api-cart';
import { CartContents } from '@/components/cart/CartContents';

export const metadata: Metadata = { title: 'Cart' };

export default async function CartPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const cart = await getCart(await liveCartDeps());

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">Your cart</h1>
      <CartContents initial={cart} />
    </main>
  );
}
```

- [ ] **Step 7: Mount AddToCartButton on the product detail page**

Modify `apps/storefront/src/app/products/[id]/page.tsx`: import the button and render it under the availability pill (it needs the product id + availability). Add the import and place the component:

```tsx
import { AddToCartButton } from '@/components/cart/AddToCartButton';
// ...after the availability <p> ... </p> block, before the description <div>:
<AddToCartButton productId={product.id} disabled={!available} />
```

- [ ] **Step 8: Build + lint + full test, then commit**

Run: `npm --prefix apps/storefront run build && npm --prefix apps/storefront run lint && npm --prefix apps/storefront test`
Expected: build clean; lint clean; all tests green.

```bash
git add apps/storefront/src/app/cart/ apps/storefront/src/components/cart/CartContents.tsx apps/storefront/src/components/cart/CartContents.test.tsx apps/storefront/src/components/cart/AddToCartButton.tsx apps/storefront/src/components/cart/AddToCartButton.test.tsx "apps/storefront/src/app/products/[id]/page.tsx"
git commit -m "feat(storefront): cart page, line editor, and add-to-cart button"
```

---

### Task 5: Gate `/cart` (route protection)

**Files:**
- Modify: `apps/storefront/src/lib/route-protection.ts`
- Modify: `apps/storefront/src/proxy.ts`
- Modify: `apps/storefront/src/lib/route-protection.test.ts` (add `/cart` cases — file exists)

**Interfaces:** none new (extends existing `PROTECTED_PREFIXES` + matcher).

- [ ] **Step 1: Add the failing test cases**

Append to `apps/storefront/src/lib/route-protection.test.ts` (inside the existing `loginRedirectFor` describe, matching its style):

```typescript
  it('redirects /cart to /login when there is no session', () => {
    expect(loginRedirectFor('/cart', false)).toBe('/login');
  });

  it('allows /cart when a session is present', () => {
    expect(loginRedirectFor('/cart', true)).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/storefront test -- route-protection`
Expected: FAIL — `/cart` is not protected yet (returns null when no session).

- [ ] **Step 3: Add `/cart` to the protected prefixes**

In `apps/storefront/src/lib/route-protection.ts`:

```typescript
const PROTECTED_PREFIXES = ['/account', '/cart'];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/storefront test -- route-protection`
Expected: PASS.

- [ ] **Step 5: Add `/cart` to the proxy matcher**

In `apps/storefront/src/proxy.ts`, add to the `matcher` array:

```typescript
    '/account/:path*',
    '/cart',
    '/cart/:path*',
```

- [ ] **Step 6: Lint + commit**

```bash
npm --prefix apps/storefront run lint && npm --prefix apps/storefront test -- route-protection
git add apps/storefront/src/lib/route-protection.ts apps/storefront/src/lib/route-protection.test.ts apps/storefront/src/proxy.ts
git commit -m "feat(storefront): gate /cart behind authentication"
```

---

### Task 6: E2E smoke + manual verification + PLAN.md

**Files:**
- Create: `apps/storefront/e2e/cart.spec.ts`
- Modify: `PLAN.md`

**Interfaces:** none (verification + docs). RULE.md §5 gate.

- [ ] **Step 1: Write the E2E spec (skips if API/seed absent, mirroring `e2e/auth.spec.ts`)**

First read `apps/storefront/e2e/auth.spec.ts` to mirror its skip-guard + login helper exactly, then write `apps/storefront/e2e/cart.spec.ts`:

```typescript
// apps/storefront/e2e/cart.spec.ts
import { test, expect } from '@playwright/test';

// Mirror auth.spec's API-availability guard + a registered/logged-in customer.
// (Use the same helper/skip pattern auth.spec uses — read it first.)

test.describe('cart', () => {
  test('add a product, see it in the cart with totals, update, remove', async ({ page }) => {
    // 1. Log in as a customer (reuse auth.spec's helper/fixture).
    // 2. Go to a product detail page; click "Add to cart".
    // 3. Header badge shows "1".
    // 4. Go to /cart; the line is listed; an order-summary total is shown.
    // 5. Increase quantity; the line total/grand total update.
    // 6. Remove the line; the empty state appears.
    // Concrete selectors/URLs filled in against the running app during Step 2.
  });
});
```

> The E2E body is finalized while running against the live app in Step 2 (selectors depend on seeded product ids). Keep the API-absent skip guard identical to `auth.spec.ts` so CI without a DB stays green.

- [ ] **Step 2: Manual smoke vs `ecom_dev` (the real gate)**

Start the API and storefront, then exercise the flow in a browser (or with the Playwright spec against the live servers):

```bash
# Terminal A: API on :5000 (against ecom_dev)
npm --prefix apps/api run start:dev
# Terminal B: storefront on :5001
npm --prefix apps/storefront run dev
```

Verify:
- Logged-out visit to `http://localhost:5001/cart` → redirected to `/login`.
- Register/log in as a customer; open a product; click **Add to cart** → header badge shows **1**.
- `/cart` lists the line with name, unit price, line total, and an order summary whose **Total matches the API** (cross-check `GET /cart` if needed).
- Increase/decrease quantity → totals update; remove → empty state with a "Browse products" link.
- Add an item, then in another (admin) session archive that product; reload `/cart` and try to increase qty → the API 400 surfaces as an inline error (not a crash).
- Run the Playwright spec headless: `npm --prefix apps/storefront run test:e2e` → cart spec passes (or skips cleanly if servers are down).

Finalize `e2e/cart.spec.ts` selectors against the running app and re-run until green.

- [ ] **Step 3: Update PLAN.md**

- Tick the Phase 4 storefront line's cart portion: the task line `Storefront: cart (add/remove/update/totals), checkout (...)` — mark the **cart** part done (the checkout part remains for slice 4). Since the line bundles cart + checkout, add a status note rather than fully checking the box; note cart UI ✅, checkout UI ⬜.
- Append a Phase 4 status note (mirroring prior slice notes): components shipped (`lib/api-cart`, `app/api/cart/*`, `CartProvider`/`useCart`, `CartCountBadge`, `/cart` page, `CartContents`, `AddToCartButton`, `/cart` gating), the data path (route-handler proxy + refresh-on-401), client-store-replace model, test counts, and the manual+E2E smoke result vs `ecom_dev`. Branch `feat/storefront-cart-ui`. Note checkout flow is the remaining Phase 4 slice.
- Keep the Phase 4 status row `🟡 In Progress`.

- [ ] **Step 4: Commit**

```bash
git add apps/storefront/e2e/cart.spec.ts PLAN.md
git commit -m "test(storefront): cart E2E; docs(phase4): cart UI slice done"
```

---

## Self-Review

**1. Spec coverage:**
- `lib/api-cart.ts` server-only client + refresh-on-401 → Task 1. ✅
- Route Handlers `app/api/cart/*` (injectable handlers) → Task 2. ✅
- `CartProvider`/`useCart` authoritative-replace store, root-layout mount, server seed → Task 3. ✅
- `CartCountBadge` client island over server header → Task 3. ✅
- `/cart` gated SSR page → Task 4 (+ gating Task 5). ✅
- `CartContents` (lines, qty stepper, remove, clear, totals from API, empty state, checkout link stub) → Task 4. ✅
- `AddToCartButton` on product page; logged-out → /login → Task 4 (+ provider's 401 redirect, Task 3). ✅
- `/cart` route protection in `route-protection.ts` + `proxy.ts` → Task 5. ✅
- Totals rendered from API strings only (`formatPrice`, no arithmetic) → Task 4 components. ✅
- Tests (api-cart, handlers, provider, badge, contents, button, route-protection) + E2E → Tasks 1–6. ✅
- Out-of-scope (checkout flow, qty selector, guest cart, optimism) → not built; checkout is a link stub. ✅

**2. Placeholder scan:** Code steps contain full, ready-to-transcribe code. The only deferred content is the E2E body (Task 6), intentionally finalized against the live app in Step 2 because selectors depend on seeded product ids — and even there, the skip-guard requirement and the flow to verify are spelled out explicitly. Everything else is concrete.

**3. Type consistency:** `CartView`/`CartItemView`/`CartTotals` (Task 1) are imported unchanged by handlers (Task 2), provider (Task 3), contents/page (Task 4). `CartApiDeps` (Task 1) consumed by `liveCartDeps` + route-deps (Task 2). `CartRouteDeps`/`CartHandlerResult` (Task 2) used by route files. `CartContextValue` incl. `hydrate` (Task 3) consumed by `CartContents` (Task 4) and `useCart`. Endpoint paths match between the provider's `fetch` calls (Task 3), the route files (Task 2), and `api-cart` (Task 1). `AddToCartButton({ productId, disabled })` signature matches its product-page mount (Task 4). ✅
