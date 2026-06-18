# Phase 4 · Slice 4 — Storefront: checkout flow

**Date:** 2026-06-17
**Branch:** `feat/storefront-checkout`
**Phase:** 4 (Cart & checkout) — fourth and final slice
**App:** `apps/storefront`

## Summary

The customer-facing checkout: a gated `/checkout` page (order review + shipping
form → place order) and an order confirmation page (`/orders/[id]`). It consumes
the already-built order API (`POST /orders`, `GET /orders/:id`) through Next
Route Handlers that proxy with the httpOnly session cookie — the same pattern as
cart and auth. Placing an order creates it server-side (status PENDING, totals
snapshot), clears the server cart, and lands the customer on a confirmation page.
**No payment** — placing = creating the order. This slice completes Phase 4.

The four Phase-4 slices:

1. API — cart + totals pipeline ✅ (merged)
2. API — order placement / checkout ✅ (merged)
3. Storefront — cart UI ✅ (merged)
4. **Storefront — checkout flow** ← *this spec*

## Scope

### In scope
- `lib/api-orders.ts` — server-only typed orders-API client (placeOrder, getOrder)
  with refresh-on-401.
- A small shared authed-request core extracted from `lib/api-cart.ts` so cart and
  orders reuse one refresh-on-401 wrapper (targeted refactor — see Architecture).
- Route Handler `app/api/orders/route.ts` (`POST`) proxying `POST /orders`
  (injectable `handlers.ts`, mirroring `app/api/cart/*`).
- `app/checkout/page.tsx` — gated SSR; loads the cart, empty → redirect `/cart`.
- `components/checkout/CheckoutView.tsx` — order review (read-only) + shipping
  form + place-order action.
- `app/orders/[id]/page.tsx` — gated SSR order confirmation (404 → `notFound()`).
- `components/orders/OrderSummary.tsx` — renders an `OrderView` (reusable later
  for order history).
- Gate `/checkout` and `/orders` in `route-protection.ts` + `proxy.ts`.
- Unit tests (Vitest+RTL) + one Playwright E2E (skips if API absent).

### Out of scope (deferred)
- **Payment** — out of PRD scope for the whole project.
- **Order history list** — this slice builds the single order-detail view
  (`/orders/[id]`); the history list (`/orders` or an account section) is a later
  slice. `OrderSummary` is written to be reusable by it.
- **Saved-address management / prefill** — the form starts empty. `GET /auth/me`
  returns only sub/email/role (no name), so prefilling `shipFullName` would cost
  an extra fetch for little value; the `Address` model has no management UI yet.
- **Editing the cart from `/checkout`** — review is read-only; the customer goes
  back to `/cart` to change quantities.
- **Quantity/stock revalidation UI beyond the API's 400** — the API re-validates
  at placement; a 400 (e.g. an item went archived) surfaces inline.

## Decisions (resolved during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Checkout shape | Single `/checkout` page (review + form) | One-call API; no multi-step state to carry; PRD's review→place fits one page. |
| Post-order landing | Confirmation page `/orders/[id]` | Reuses `GET /orders/:id`; a real, linkable landing; seeds order history. |
| Shipping form | All `CheckoutDto` fields, no prefill | API is the authority; no name in the session; no address UI yet. |
| Orders data path | Route Handlers proxy with cookie | Matches cart/auth; tokens never reach the browser. |
| Empty cart at checkout | Redirect to `/cart` | `/cart` already owns the canonical empty state. |
| After place | Reset client cart store + redirect to confirmation | Header badge drops to 0 immediately; API already cleared the server cart. |
| Confirmation gating | Gated SSR; ownership via API 404 → `notFound()` | Consistent with `/cart`/`/account`; no existence leak. |
| Store reset mechanism | `hydrate(EMPTY_CART)` | The provider already exposes `hydrate`; no new method needed. |

## Architecture

### Targeted refactor: shared authed-request core

`lib/api-cart.ts` already contains a generic authed-fetch + refresh-on-401
wrapper (`cartRequest`) plus the `CartApiDeps` shape and `liveCartDeps()`
(cookie-bound deps). `lib/api-orders.ts` needs the identical apparatus. To avoid
duplicating the refresh logic (and risk drift), extract the generic core into a
new `lib/api-authed.ts`:

```ts
// lib/api-authed.ts (server-only)
export interface AuthedApiDeps {
  baseUrl: string;
  getAccessToken(): string | undefined;
  getRefreshToken(): string | undefined;
  onTokensRefreshed(pair: TokenPair): void | Promise<void>;
  onSessionInvalid(): void | Promise<void>;
  refresh?(refreshToken: string): Promise<TokenPair>;
  fetch?: typeof fetch;
}

/** Call an API path with the access token; refresh once on 401 and retry.
 *  Non-401 retry errors are surfaced unchanged (not masked as 401). */
export async function authedRequest<T>(path: string, init: RequestInit, deps: AuthedApiDeps): Promise<T>;

/** Build cookie-bound deps (Server Components / Route Handlers). */
export async function liveAuthedDeps(): Promise<AuthedApiDeps>;
```

This is exactly the current `cartRequest` + `liveCartDeps` body, renamed and
generalized (it has nothing cart-specific). Then:

- `lib/api-cart.ts` keeps its `CartView`/`CartItemView`/`CartTotals` types and
  the `getCart`/`addItem`/… functions, now calling `authedRequest` instead of the
  local `cartRequest` (which is deleted). To avoid breaking existing importers,
  keep `liveCartDeps()` as a thin re-export/alias of `liveAuthedDeps()` and keep
  `CartApiDeps` as an alias of `AuthedApiDeps` (or update the few importers —
  `app/api/cart/route-deps.ts` is the only one; updating it to `liveAuthedDeps`
  is acceptable). The cart unit tests must stay green — the behavior is identical;
  only the wrapper's home moves.
- `lib/api-orders.ts` (new) defines `OrderView`/`OrderItemView`/`CheckoutInput`
  types and `placeOrder`/`getOrder` over `authedRequest`.

This refactor touches merged cart code, justified because it removes the
duplication this slice would otherwise introduce. The cart tests are the
regression net; a behavior-preserving move keeps them green unedited.

### Orders API client (`lib/api-orders.ts`, server-only)

```ts
export interface OrderItemView {
  productId: string; productName: string; unitPrice: string;
  quantity: number; lineTotal: string;
}
export interface OrderView {
  id: string; status: string;
  subtotal: string; discountTotal: string; taxTotal: string;
  shippingTotal: string; grandTotal: string;
  shipFullName: string; shipLine1: string; shipLine2: string | null;
  shipCity: string; shipState: string; shipCountry: string; shipPostalCode: string;
  items: OrderItemView[]; createdAt: string;
}
export interface CheckoutInput {
  shipFullName: string; shipLine1: string; shipLine2?: string;
  shipCity: string; shipState: string; shipCountry: string; shipPostalCode: string;
}

export function placeOrder(input: CheckoutInput, deps: AuthedApiDeps): Promise<OrderView>; // POST /orders
export function getOrder(id: string, deps: AuthedApiDeps): Promise<OrderView>;             // GET /orders/:id
```

Mirrors the API's `OrderView` (note `createdAt` arrives as a JSON string).

### Route Handler (`app/api/orders/route.ts` + `handlers.ts` + `route-deps.ts`)

Mirrors `app/api/cart/*`. Only `POST` is needed (the confirmation page reads
server-side directly via `api-orders.getOrder`):

- `handledPlaceOrder(input, deps): Promise<{status, body}>` — validates the
  shipping fields are present (the API re-validates too), calls `deps.placeOrder`,
  maps success → `{201, order}` and `ApiAuthError` → `{status, {message}}`.
- `route.ts` `POST` → parses the body, calls the handler, returns
  `NextResponse.json(body, { status })`.

### Pages & components

- **`app/checkout/page.tsx`** (Server Component): `getCurrentUser()` →
  `redirect('/login')`; `getCart(await liveAuthedDeps())`; if `items.length === 0`
  → `redirect('/cart')`; render `<CheckoutView cart={cart} />`.
  `export const metadata = { title: 'Checkout' }`.
- **`components/checkout/CheckoutView.tsx`** (client): two columns —
  - **Order review** (read-only): line rows (name, qty, line total via
    `formatPrice`) + totals panel (subtotal/tax/shipping/grand from the cart
    envelope — never recomputed). Same discount-omission as the cart.
  - **Shipping form**: all `CheckoutInput` fields (`shipLine2` optional);
    required-field client validation; "Place order" submits to `POST /api/orders`.
    On success: `hydrate(EMPTY_CART)` (reset store → badge 0) then
    `router.push('/orders/' + order.id)`. On 401 → `router.push('/login')`. On
    other non-ok → inline error from the API message. Disable the button while
    submitting.
- **`app/orders/[id]/page.tsx`** (Server Component): `getCurrentUser()` →
  `redirect('/login')`; `getOrder(id, await liveAuthedDeps())` wrapped so a 404
  (`ApiAuthError.status === 404`) → `notFound()`; render a confirmation header
  ("Order placed") + `<OrderSummary order={order} />`. `generateMetadata` →
  `{ title: 'Order ' + id }` (or "Order confirmation").
- **`components/orders/OrderSummary.tsx`**: renders an `OrderView` — status,
  order id, item rows (productName, qty, unitPrice, lineTotal via `formatPrice`),
  totals panel, and the shipping address snapshot. Pure presentational; reusable.

### Route protection
- `route-protection.ts`: add `'/checkout'` and `'/orders'` to `PROTECTED_PREFIXES`.
- `proxy.ts`: add `'/checkout'`, `'/orders'`, `'/orders/:path*'` to the matcher.
- Pages re-verify via `getCurrentUser()` (defense in depth).

## Data flow

```
/cart "Proceed to checkout" → /checkout (SSR cart; empty → /cart)
  → fill shipping → "Place order"
  → POST /api/orders  (route handler: cookie + refresh-on-401)
      → API POST /orders  (re-validate, snapshot order PENDING, clear cart) → OrderView
  → client: hydrate(EMPTY_CART)  (header badge → 0)
  → router.push('/orders/<id>')
      → confirmation page SSR getOrder(<id>) → OrderSummary
```

## Error handling

| Case | Behavior |
|---|---|
| Logged-out `/checkout` or `/orders/[id]` | middleware → `/login`; page also redirects if `getCurrentUser()` null |
| Empty cart at `/checkout` | `redirect('/cart')` |
| Missing required shipping field | client validation blocks submit; API also 400s |
| API 400 (archived item / validation) | inline error on the form; no order created; cart not reset |
| Place-order 401 | `router.push('/login')` |
| `/orders/[id]` not owned / unknown | API 404 → `notFound()` (no existence leak) |
| Totals | always rendered from the API (cart envelope on review; order envelope on confirmation) — never recomputed |

## Testing (TDD: red → green → refactor)

### `lib/api-authed.test.ts` (the extracted core)
- Inherits the proven cart-request cases: bearer token sent; refresh-on-401 →
  retry with new token + persist; refresh fail → onSessionInvalid + 401; non-401
  retry error surfaced unchanged; message flattening. (Move/adapt from the
  current `api-cart.test.ts` refresh cases so coverage doesn't regress.)

### `lib/api-cart.test.ts` (post-refactor)
- Existing cart tests stay green unedited (behavior preserved); cart functions
  still issue the right method/path/body.

### `lib/api-orders.test.ts`
- `placeOrder` POSTs `/orders` with the shipping body + bearer; returns OrderView.
- `getOrder` GETs `/orders/:id`; returns OrderView; encodes the id.

### `app/api/orders/handlers.test.ts`
- place success → `{201, order}`; missing shipping field → 400; ApiAuthError →
  `{status, {message}}`.

### `components/checkout/CheckoutView.test.tsx`
- Renders order review (lines + totals from the cart envelope).
- Required-field validation blocks submit (no fetch) until fields filled.
- Valid submit POSTs `/api/orders` with the shipping body.
- Success → resets store (`hydrate` called with empty) + redirects to
  `/orders/<id>` (mock router).
- API 400 → inline error shown; no redirect.

### `components/orders/OrderSummary.test.tsx`
- Renders status, items (productName, qty, line total), totals, shipping snapshot
  from an `OrderView`.

### `lib/route-protection.test.ts`
- `/checkout` and `/orders` → `/login` when no session; allowed when present.

### Playwright `e2e/checkout.spec.ts` (skips if API absent, like cart/auth)
- Log in → add a product → go to `/checkout` → fill shipping → Place order →
  land on `/orders/<id>` showing the order + "Order placed" → header badge is 0.
- Logged-out `/checkout` → `/login`.

**Coverage target:** 80% (advisory). Critical: the place-order success path
(store reset + redirect), the 400/401 handling, ownership 404 on confirmation,
and the behavior-preserving refactor (cart tests stay green).

## Risks & considerations

- **Refactor touches merged `api-cart.ts`.** Mitigated: behavior-preserving
  extraction; the cart unit tests are the regression net and must stay green; the
  refresh cases move into `api-authed.test.ts` so the refresh coverage doesn't
  regress.
- **Double order submit** (double-click / back-then-resubmit): the place button
  disables while submitting; a second submit after success would hit an empty
  cart → API 400 (nothing to order), surfaced inline. Acceptable for this slice
  (idempotency keys are out of scope).
- **`createdAt` as string** from JSON — typed as `string`; rendered with a simple
  locale format, no arithmetic.
- **Totals divergence** — impossible: review uses the cart envelope, confirmation
  uses the order envelope; both are API-authoritative and the order-placement
  slice already proved order totals == cart totals.

## Verification steps

1. `npm --prefix apps/storefront test` — unit suite green (existing + new; cart
   tests unchanged after the refactor).
2. `npm --prefix apps/storefront run lint` — clean.
3. `npm --prefix apps/storefront run build` — clean.
4. Start API (`:5000`) + storefront (`:5001`) vs `ecom_dev`; log in; add a
   product; `/checkout` → fill shipping → Place order → land on `/orders/<id>`
   with the order details; header badge is 0; back to `/checkout` → redirected to
   `/cart` (now empty); another customer can't open the order (404); logged-out
   `/checkout` → `/login`.

## Suggested commit (spec)

```
docs(phase4): spec — storefront checkout flow
```
