# Phase 4 · Slice 3 — Storefront: cart UI

**Date:** 2026-06-17
**Branch:** `feat/storefront-cart-ui`
**Phase:** 4 (Cart & checkout) — third slice
**App:** `apps/storefront`

## Summary

The customer-facing cart UI: a `/cart` page to view and edit the cart, an
**Add to cart** button on the product detail page, and a live item-count badge
on the existing header cart icon. All cart data comes from the slice-1 cart API
(`apps/api/src/cart`), reached through Next Route Handlers that proxy with the
httpOnly session cookie — the same pattern the storefront's auth forms already
use. The cart is CUSTOMER-only; `/cart` is gated like `/account`. Totals are
rendered exactly as the API returns them (never recomputed client-side).

This is the third of four Phase-4 slices:

1. API — cart + totals pipeline ✅ (merged)
2. API — order placement / checkout ✅ (merged)
3. **Storefront — cart UI** ← *this spec*
4. Storefront — checkout flow

## Scope

### In scope
- `lib/api-cart.ts` — server-only typed cart-API client with refresh-on-401
  (mirrors `lib/api-auth.ts` + `lib/session.ts` refresh logic).
- Route Handlers under `app/api/cart/*` proxying the cart API (logic in an
  injectable `handlers.ts`, mirroring `app/api/auth/*`).
- `app/cart/page.tsx` — gated Server Component; SSR-loads the cart, renders the
  client cart UI seeded with it.
- `components/cart/CartContents.tsx` — line list (image, name, price, qty
  stepper, remove), totals panel, empty state, clear-cart, checkout-link stub.
- `components/cart/AddToCartButton.tsx` — on the product detail page.
- `components/cart/CartProvider.tsx` + `useCart()` — client cart context
  (authoritative state, no optimism), mounted in the root layout, seeded from a
  server-read snapshot.
- `components/cart/CartCountBadge.tsx` — client island over the header cart icon.
- Gate `/cart` in `lib/route-protection.ts` + `proxy.ts` (like `/account`).
- Unit tests (Vitest+RTL) + one Playwright E2E (skips if API/seed absent).

### Out of scope (deferred)
- **Checkout flow** (shipping form, order review, place order) — slice 4. The
  "Proceed to checkout" control is a link stub to `/checkout` (built next).
- **Quantity selector on the product page** — Add to cart adds 1 (the API
  increments if the line exists). YAGNI for this slice.
- **Guest cart** — the API is CUSTOMER-only; logged-out users are redirected to
  login. (Matches the cart-API decision.)
- **Optimistic UI** — the store replaces state with the API's authoritative
  envelope after each mutation.

## Decisions (resolved during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Cart data path | Next Route Handlers proxy with cookie | Matches the existing auth-mutation pattern; tokens never reach the browser. |
| Slice scope | Cart page + add-to-cart + header badge | End-to-end usable; checkout is the next slice. |
| Guest handling | Gate `/cart` like `/account`; add-to-cart logged-out → `/login` | API is CUSTOMER-only; consistent with existing protection. |
| Cart page load | SSR initial + client mutations | Fast first paint; interactivity client-side. |
| Header sync | Client cart context/store | Snappy badge without a full route refresh. |
| Store updates | Authoritative replace (no optimism) | API returns the full cart+totals envelope each call; simplest correct path. |
| Provider scope | Root layout, seeded from server | Header badge + cart page share one store; correct on first paint. |
| Add-to-cart quantity | Fixed 1 (API increments) | No qty selector on the product page (YAGNI). |

## Architecture

### Data path (mirrors `app/api/auth/*`)

```
Client component ──fetch('/api/cart/..')──▶ Route Handler ──api-cart (cookie + refresh-on-401)──▶ API /cart/*
        ▲                                                                                    │
        └────────────────── CartView envelope (json) ◀───────────────────────────────────────┘
```

### `lib/api-cart.ts` (server-only)

A typed client for the cart API, structurally identical to `lib/api-auth.ts`
(reuses its `ApiAuthError`/message-flattening conventions). The session token is
read from cookies and refreshed on 401, reusing the refresh primitive from
`lib/api-auth.ts` (`refresh`) and the cookie names from `lib/session.ts`.

```ts
/** The cart envelope returned by every cart endpoint (mirrors API CartView). */
export interface CartItemView {
  productId: string;
  name: string;
  unitPrice: string;   // 2-dp string
  quantity: number;
  lineTotal: string;
  image: string | null;
}
export interface CartTotals {
  subtotal: string; discountTotal: string; taxTotal: string;
  shippingTotal: string; grandTotal: string;
}
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
  onTokensRefreshed(pair: TokenPair): void; // persist new cookies
  onSessionInvalid(): void;                  // clear cookies
  fetch?: typeof fetch;
}

/** Pure resolver: call the cart API with the access token; on 401 refresh once
 *  and retry; on refresh failure call onSessionInvalid and throw ApiAuthError(401). */
export async function cartRequest<T>(path: string, init: RequestInit, deps: CartApiDeps): Promise<T>;

// Convenience methods bound through cartRequest:
export function getCart(deps): Promise<CartView>;
export function addItem(productId: string, quantity: number, deps): Promise<CartView>;
export function setItemQuantity(productId: string, quantity: number, deps): Promise<CartView>;
export function removeItem(productId: string, deps): Promise<CartView>;
export function clearCart(deps): Promise<CartView>;

/** Build live deps bound to cookies() + apiBaseUrl (Server Components / handlers). */
export async function liveCartDeps(): Promise<CartApiDeps>;
```

`cartRequest` refresh-on-401 mirrors `resolveSession`: try with the access
token; on `ApiAuthError(401)` and a present refresh token, call `refresh`,
persist via `onTokensRefreshed`, retry once; if anything in the refresh path
fails, `onSessionInvalid()` and throw a 401.

### Route Handlers (`app/api/cart/*`)

Thin adapters with logic in an injectable `handlers.ts` (mirrors
`app/api/auth/handlers.ts`). Each reads the request, calls the matching
`api-cart` method via `liveCartDeps()`, and returns `{ status, body }` (the
`CartView` envelope, or the API error status + message). A 401 from
`api-cart` becomes a 401 to the client (the client treats it as "session
expired → go to login").

| Method + path | Handler | API call |
|---|---|---|
| `GET /api/cart` | `handleGetCart` | `getCart` |
| `POST /api/cart/items` `{productId, quantity}` | `handleAddItem` | `addItem` |
| `PATCH /api/cart/items/[productId]` `{quantity}` | `handleSetQuantity` | `setItemQuantity` |
| `DELETE /api/cart/items/[productId]` | `handleRemoveItem` | `removeItem` |
| `DELETE /api/cart` | `handleClearCart` | `clearCart` |

### Client cart context (`components/cart/CartProvider.tsx`)

```ts
interface CartContextValue {
  cart: CartView | null;
  itemCount: number;          // derived: sum of item quantities
  pending: boolean;
  add(productId: string, quantity?: number): Promise<void>;
  setQuantity(productId: string, quantity: number): Promise<void>;
  remove(productId: string): Promise<void>;
  clear(): Promise<void>;
  hydrate(cart: CartView): void;   // load the full SSR cart into the shared store
  error: string | null;
}
```

- Mounted in the root layout, wrapping `SiteHeader` + `children`.
- Seeded with an `initialCart: CartView | null` prop the root layout reads
  server-side (so `itemCount` is correct on first paint; `null`/empty for guests).
- Each action `fetch`es the route handler, sets `pending`, and **replaces**
  `cart` with the returned envelope (authoritative). On a 401 it routes to
  `/login`; on other errors it sets `error`.
- `itemCount` derives from `cart.items` (sum of quantities).

### Header badge (`components/cart/CartCountBadge.tsx`)

A small client component rendered by `SiteHeaderView` over the existing
`CartIcon`. Reads `itemCount` from `useCart()`; renders a badge when > 0
(`aria-label` includes the count; hidden when empty). The header stays a Server
Component; only the badge is a client island.

### Pages & components

- `app/cart/page.tsx` (Server Component): `getCurrentUser()` → `redirect('/login')`
  if null; `api-cart.getCart()` for SSR data; render `<CartContents initial={cart} />`.
  `export const metadata = { title: 'Cart' }`.
- `components/cart/CartContents.tsx` (client): seeds the store via the provider
  (the page is inside the root-layout provider; it calls a `hydrate(initial)` on
  mount, or the provider accepts the page's initial through context — see Open
  detail below). Renders line rows (reusing `components/catalog/Price.tsx` for
  money + the line image), a qty stepper (− / value / +, min 1; "Remove" at 1 or
  a trash action), a totals panel, an **empty state** ("Your cart is empty" +
  link to `/products`), a "Clear cart" action (with `window.confirm`), and a
  "Proceed to checkout" link to `/checkout` (stub).
- `components/cart/AddToCartButton.tsx` (client): placed on
  `app/products/[id]/page.tsx`. Calls `useCart().add(productId)`; shows pending +
  a transient "Added ✓"; if `useCart` reports logged-out (or a 401 comes back),
  `router.push('/login')`.

**Open detail (resolved):** the root-layout provider is seeded with a light
snapshot (count + totals) for the badge; the `/cart` page holds the full
authoritative cart and, on mount, calls `useCart().hydrate(fullCart)` to load
items into the shared store so the page and badge agree. `hydrate` is part of
the context value.

### Route protection

- `lib/route-protection.ts`: add `'/cart'` to `PROTECTED_PREFIXES`.
- `proxy.ts`: add `'/cart/:path*'` (and `'/cart'`) to the matcher.
- The page re-verifies via `getCurrentUser()` (defense in depth, like `/account`).

## Error handling

| Case | Behavior |
|---|---|
| Logged-out visits `/cart` | middleware → `/login`; page also redirects if `getCurrentUser()` null |
| Logged-out clicks Add to cart | `router.push('/login')` (pre-empts the API 401) |
| Session expired mid-action | `api-cart` refreshes on 401; on success retries; on failure → 401 → client routes to `/login` |
| API 400 (e.g. archived product) | route handler returns 400 + message; client shows it |
| Network/unknown | client shows a generic "Unable to update cart" message |
| Totals | always rendered from the API envelope; never recomputed |

## Testing (TDD: red → green → refactor)

### `lib/api-cart.test.ts`
- `getCart`/`addItem`/etc. issue the right method/path/body with the bearer token.
- 401 → refresh → retry succeeds (tokens persisted via `onTokensRefreshed`).
- 401 → refresh fails → `onSessionInvalid` called + throws 401.
- API error body (string / string[] message) flattened to one line.

### `app/api/cart/handlers.test.ts` (injectable deps, mirrors auth handlers)
- Each handler maps success → `{200, envelope}` and API error → `{status, message}`.

### `components/cart/CartProvider.test.tsx`
- Seeds `itemCount` from `initialCart`.
- An action replaces `cart` with the returned envelope; `pending` toggles.
- 401 from an action triggers a login redirect (mock router).

### `components/cart/CartContents.test.tsx`
- Renders lines (name, qty, line total) + totals from the envelope.
- Qty +/- calls `setQuantity`; remove calls `remove`; clear calls `clear`.
- Empty cart → empty state + `/products` link, no totals panel.

### `components/cart/AddToCartButton.test.tsx`
- Click calls `add(productId)`; pending disables the button; shows "Added".
- Logged-out path → router push to `/login`.

### `components/cart/CartCountBadge.test.tsx`
- Renders the count when > 0; renders nothing (or hidden) when 0.

### Playwright `e2e/cart.spec.ts` (skips if API/seed absent, like `auth.spec`)
- Log in → product page → Add to cart → header badge shows 1 → `/cart` lists the
  line with totals → increment qty → remove → empty state.

**Coverage target:** 80% (advisory). Critical: the refresh-on-401 path, the
store's authoritative-replace, and totals rendered verbatim from the API.

## Risks & considerations

- **Two sources of cart truth on the client** (badge snapshot vs full page cart)
  — mitigated by a single shared store: the badge seed and the page `hydrate`
  both write the same `cart` state; `itemCount` derives from it.
- **Refresh-on-401 duplicated logic** — mitigated by reusing `api-auth.refresh`
  and the session cookie names; the cart helper only adds the bearer + retry
  wrapper, tested in isolation.
- **Header is a Server Component** — the badge must be a client island; keep the
  island minimal so the header stays server-rendered and fast.
- **Totals divergence** — impossible by construction: the client renders only
  the API's strings; no arithmetic client-side (enforced by `money.ts` being
  display-only).
- **Checkout link is a stub** — `/checkout` 404s until slice 4; acceptable and
  noted (the button links forward, the route lands next slice).

## Verification steps

1. `npm --prefix apps/storefront test` — unit suite green (existing + new cart).
2. `npm --prefix apps/storefront run lint` — clean.
3. `npm --prefix apps/storefront run build` — clean.
4. Start the API (`:5000`) + storefront (`:5001`) against `ecom_dev`; log in as a
   customer; add a product → badge increments → `/cart` shows it with correct
   totals → update/remove/clear → empty state; logged-out `/cart` → `/login`.

## Suggested commit (spec)

```
docs(phase4): spec — storefront cart UI
```
