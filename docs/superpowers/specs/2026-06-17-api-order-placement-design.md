# Phase 4 · Slice 2 — API: order placement (checkout)

**Date:** 2026-06-17
**Branch:** `feat/api-order-placement`
**Phase:** 4 (Cart & checkout) — second slice
**App:** `apps/api`

## Summary

A CUSTOMER-scoped checkout endpoint that converts the caller's cart into an
`Order`: it re-resolves each line's current price, recomputes totals through the
**same pipeline the cart uses** (so the order snapshot can never diverge from
what the customer saw), snapshots items + totals + shipping address onto the
order, clears the cart, and returns the order. Plus read endpoints for order
history and order detail. **No payment processing** (placing = creating the
order) and **no inventory** (stock reservation is Phase 5).

This is the second of four Phase-4 slices:

1. API — cart + totals pipeline ✅ (merged)
2. **API — order placement / checkout** ← *this spec*
3. Storefront — cart UI
4. Storefront — checkout flow

## Scope

### In scope
- `POST /orders` — place an order from the caller's cart (shipping in body) → `201` with the created order.
- `GET /orders` — caller's order history, paginated, newest-first (lightweight shape).
- `GET /orders/:id` — caller's order detail with full line items.
- Extract a **shared totals/line-pricing helper** so `CartService` and the new
  `OrdersService` compute prices and totals through one path.
- Unit tests (mocked Prisma) + an HTTP smoke run vs `ecom_dev`.

### Out of scope (deferred)
- **Inventory.** No stock reservation, no `InventoryMovement`, no available/
  reserved changes. Phase 5 wires reservation into placement.
- **Order status transitions beyond creation.** The order is created at status
  `PENDING`; admin status updates, cancellation, refunds are Phase 5. The
  `order-status.ts` state machine already exists and is untouched here.
- **Payment.** Out of PRD scope for the whole project.
- **Saved-address selection.** Shipping arrives inline in the checkout body; the
  `Address` model is not consulted (no address-management UI exists yet).
- **Notifications** (order-confirmation event) — Phase 6.
- **Audit logging** — Phase 7.

## Decisions (resolved during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Stock on placement | Defer all inventory to Phase 5 | Keeps the slice focused; matches the cart slice's deferral of stock gating. |
| Cart after placement | Clear the cart (same transaction) | Customer starts fresh; prevents double-ordering the same cart. |
| Initial order status | `PENDING` | The state machine's initial state; no payment ⇒ not yet confirmed. |
| Shipping source | Inline in `CheckoutDto` body | No saved-address UI yet; the order snapshots shipping regardless. |
| Totals authority | Reuse the cart pipeline via a shared helper | Single source of truth; cart view and order review can never diverge. |
| Empty cart | `400` | Nothing to order. |
| Line product re-validation | Re-resolve at placement; non-`ACTIVE` line → `400` | Don't let a since-archived/inactive product slip into an order. |
| `GET /orders` shape | Lightweight (totals + status + item count), no full items | Small list payloads; full `items[]` only on detail. |
| Authorization | `@Roles(Role.CUSTOMER)` on every route | Customers place/own orders. Admin order management is Phase 5. API-enforced. |

## Architecture

Build out the existing `orders/` module (currently only `order-status.ts` + an
empty `orders.module.ts`), mirroring the `cart/` and `products/` conventions.

```
apps/api/src/
  cart/
    cart-pricing.ts          # NEW — shared pure helper (extracted from buildEnvelope)
    cart-pricing.spec.ts     # NEW
    cart.service.ts          # MODIFIED — buildEnvelope delegates to the helper
  orders/
    orders.module.ts         # MODIFIED — wire controller + service; import CartModule
    orders.controller.ts     # NEW — @Roles(CUSTOMER): POST/GET/GET :id
    orders.service.ts        # NEW — placeOrder / listOrders / getOrder
    orders.service.spec.ts   # NEW
    order-status.ts          # UNCHANGED
    dto/
      checkout.dto.ts        # NEW — shipping fields
      list-orders.dto.ts     # NEW — pagination
```

### The shared pricing helper (`cart/cart-pricing.ts`)

Extracts the price-resolution + line-building + totals math currently inlined in
`CartService.buildEnvelope`. Pure (no Prisma client, no Nest) — it accepts
already-loaded rows and the config.

```ts
/** Minimal product shape the pricer needs (a subset of the Prisma row). */
export interface PricingProduct {
  name: string;
  price: string;       // Decimal as string
  salePrice: string | null;
}
export interface PricingItem {
  productId: string;
  quantity: number;
  product: PricingProduct;
  imageUrl?: string | null;  // optional; cart passes it, orders ignore it
}
export interface PricedLine {
  productId: string;
  name: string;
  unitPrice: string;   // effective, 2-dp string
  quantity: number;
  lineTotal: string;
  imageUrl: string | null;
}
export interface PricedResult {
  lines: PricedLine[];
  totals: CartTotals;        // from ./totals
}

/** Effective unit price in integer cents: sale price when strictly below regular. */
export function effectiveUnitCents(price: string, salePrice: string | null): number;

/** Build priced lines + run the totals pipeline. The single pricing authority. */
export function priceItems(items: PricingItem[], config: TotalsConfig): PricedResult;
```

`effectiveUnitCents` moves here verbatim from `cart.service.ts`. `CartService.buildEnvelope`
becomes a thin adapter: map the loaded cart items into `PricingItem[]`, call
`priceItems`, then shape `CartView` from the result (mapping `imageUrl` → `image`).
`CartItemView`/`CartView` stay where they are; only the math moves.

### `OrdersService`

```ts
placeOrder(userId: string, dto: CheckoutDto): Promise<OrderView>
listOrders(userId: string, query: ListOrdersDto): Promise<Paginated<OrderSummary>>
getOrder(userId: string, orderId: string): Promise<OrderView>
```

Reuses `resolveTotalsConfig` (from `cart/cart.config.ts`) for the pipeline config,
and `priceItems` for the math. `Paginated<T>` mirrors the products service envelope
(`{ data, page, pageSize, total, totalPages }`).

### `placeOrder` flow (one `prisma.$transaction`)

1. Load the caller's cart with items + product (`name, price, salePrice, status, deletedAt`).
2. **Empty cart (no cart, or zero items) → `400`** ("Your cart is empty").
3. For each line, re-resolve the product: must be non-soft-deleted **and** `status === ACTIVE`, else **`400`** ("'<name>' is no longer available; remove it to checkout").
4. `priceItems(lines, config)` → authoritative `lines` + `totals`.
5. In a transaction:
   - `order.create` — `userId`, `status: PENDING`, the five totals (`subtotal`,
     `discountTotal`, `taxTotal`, `shippingTotal`, `grandTotal`), denormalized
     shipping from the DTO, and nested `items.create` from the priced lines
     (`productId`, `productName`, `unitPrice`, `quantity`, `lineTotal`).
   - `cartItem.deleteMany({ where: { cartId } })` — clear the cart.
6. Return the created order with items (`OrderView`).

Steps 1–4 run before the transaction (reads + validation); the transaction
covers the order write + cart clear so they are atomic.

## API contract

### `POST /orders` — body `CheckoutDto`
```jsonc
{
  "shipFullName": "Ada Lovelace",
  "shipLine1": "12 Analytical Way",
  "shipLine2": "Apt 1",          // optional
  "shipCity": "London",
  "shipState": "Greater London",
  "shipCountry": "UK",
  "shipPostalCode": "EC1A 1BB"
}
```
→ `201`, body = `OrderView`.

### `OrderView` (POST result and `GET /orders/:id`)
```jsonc
{
  "id": "ckorder...",
  "status": "PENDING",
  "subtotal": "39.98", "discountTotal": "0.00", "taxTotal": "4.00",
  "shippingTotal": "5.00", "grandTotal": "48.98",
  "shipFullName": "Ada Lovelace", "shipLine1": "...", "shipLine2": "Apt 1",
  "shipCity": "...", "shipState": "...", "shipCountry": "...", "shipPostalCode": "...",
  "items": [
    { "productId": "...", "productName": "Wireless Mouse",
      "unitPrice": "19.99", "quantity": 2, "lineTotal": "39.98" }
  ],
  "createdAt": "2026-06-17T12:00:00.000Z"
}
```

### `GET /orders` — paginated `OrderSummary` (no items)
```jsonc
{
  "data": [
    { "id": "...", "status": "PENDING", "grandTotal": "48.98",
      "itemCount": 2, "createdAt": "..." }
  ],
  "page": 1, "pageSize": 20, "total": 1, "totalPages": 1
}
```
`itemCount` = number of order lines (via Prisma `_count`). Newest-first
(`createdAt desc`), backed by the existing `@@index([userId, createdAt])`.

## Error handling

| Case | Status |
|---|---|
| Unauthenticated / non-CUSTOMER | `401` / `403` (global guards) |
| Empty cart on `POST /orders` | `400` |
| A cart line's product is not ACTIVE (or soft-deleted) at placement | `400` |
| `CheckoutDto` validation failure (missing/blank shipping field) | `400` |
| `GET /orders/:id` for an order that isn't the caller's, or unknown id | `404` (no existence leak) |
| Prisma `P2025` | `404` via a `mapWriteError` mirroring the cart/categories pattern |

## Money / consistency

- Totals and line prices come exclusively from `priceItems` (integer-cents math,
  2-dp string output) — never recomputed elsewhere, never trusted from the client.
- `OrderItem.unitPrice`/`lineTotal` and the order's five totals are **snapshots**
  taken at placement; later price changes don't affect a placed order.
- The order's `grandTotal` equals what `GET /cart` returned for the same cart
  contents at the same moment (same pipeline, same config) — verified by the
  shared-helper test and the smoke run.

## Testing (TDD: red → green → refactor)

### `cart/cart-pricing.spec.ts` (pure)
- `effectiveUnitCents`: sale below regular → sale; sale ≥ regular → regular; null → regular; `0.00` sale → used (Decimal-0 not coerced).
- `priceItems`: empty → zero totals; multi-line subtotal; line totals; totals delegated to `computeTotals` (free-shipping boundary covered there already, so just assert wiring).
- **Divergence guard:** a fixed set of cart rows through `priceItems` yields the
  exact totals the cart slice produced for the same rows (lock cart ↔ order parity).

### `cart/cart.service.spec.ts` (existing — keep green)
- After the refactor, the existing cart service tests must still pass unchanged
  (the helper is an internal extraction; `CartView` output is identical).

### `orders/orders.service.spec.ts` (mocked Prisma)
- `placeOrder`: multi-line cart → creates order (status PENDING; totals + item
  snapshots correct), and clears the cart (assert `cartItem.deleteMany` called).
- `placeOrder`: empty cart → `400` (no order created, cart not cleared).
- `placeOrder`: a non-ACTIVE line → `400` (no order created).
- `placeOrder`: uses a transaction (assert `$transaction` used so order-write +
  cart-clear are atomic).
- `getOrder`: returns the caller's order; another user's id / unknown id → `404`.
- `listOrders`: returns paginated summaries with `itemCount`, newest-first;
  `where` filters by `userId`; same `where` feeds findMany + count.

### Smoke (RULE.md §5 — real API vs `ecom_dev` over HTTP)
- Customer builds a cart (reuse slice-1 endpoints), `POST /orders` with shipping →
  `201`; order `grandTotal` matches the cart's pre-checkout `grandTotal`.
- `GET /cart` afterwards → empty (cart cleared).
- `GET /orders` → the order appears (summary, correct itemCount); `GET /orders/:id`
  → full items + totals + shipping snapshot.
- A **second** customer `GET /orders/:id` on the first's order → `404`.
- Empty-cart `POST /orders` → `400`.
- Place a cart, archive one of its products via admin, then `POST /orders` → `400`.
- Boundary: unauthenticated / ADMIN token → `401` / `403`.

**Coverage target:** 80% (advisory). Domain-critical: the placement transaction
(order snapshot + cart clear atomicity), product re-validation, ownership scoping,
and cart↔order totals parity.

## Risks & considerations

- **Refactor touches merged `CartService`.** Mitigated: the extraction is
  behavior-preserving; the existing cart tests are the regression net and must
  stay green, and the divergence-guard test locks parity.
- **Transaction scope.** Reads/validation happen before the transaction; only the
  order write + cart clear are transactional. A product archived in the window
  between validation and commit would still be ordered — acceptable for this
  slice (true stock/availability enforcement is Phase 5's reservation step).
- **No inventory means oversell is possible** until Phase 5 — expected and
  documented; placement does not check or decrement stock.
- **Ownership via `userId` scoping** on every read prevents cross-customer access;
  `GET /orders/:id` returns `404` (not `403`) for someone else's order to avoid
  leaking that the id exists.

## Verification steps

1. `npm --prefix apps/api test` — full unit suite green (existing cart/products/
   auth + new pricing + orders).
2. `npm --prefix apps/api run lint` — clean.
3. `npm --prefix apps/api run build` — clean.
4. Start `npm --prefix apps/api run start:dev` against `ecom_dev`; run the smoke
   sequence above over HTTP; confirm statuses, totals parity, cart cleared, and
   ownership 404.

## Suggested commit (spec)

```
docs(phase4): spec — API order placement (checkout)
```
