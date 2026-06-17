# Phase 4 · Slice 1 — API: server-authoritative cart + totals pipeline

**Date:** 2026-06-17
**Branch:** `feat/api-cart`
**Phase:** 4 (Cart & checkout) — first slice
**App:** `apps/api`

## Summary

A CUSTOMER-scoped, server-authoritative shopping cart with a single shared
totals pipeline (`subtotal → discounts → taxes → shipping → grand total`). One
active cart per user. Line prices reflect the product's **current** price on
every read (sale price when active) — never a stale snapshot. The totals
pipeline is a pure function so that this cart slice and the later order-review
slice compute identical numbers.

This is the first of four Phase-4 slices:

1. **API — cart + totals pipeline** ← *this spec*
2. API — checkout / place order (cart → `Order`, totals snapshot, no payment)
3. Storefront — cart UI
4. Storefront — checkout flow

## Scope

### In scope
- `GET /cart` — get-or-create the caller's cart, returned with computed totals.
- `POST /cart/items` — add a product (increments quantity if already present).
- `PATCH /cart/items/:productId` — set the absolute quantity (`0` ⇒ remove).
- `DELETE /cart/items/:productId` — remove a line.
- `DELETE /cart` — clear the cart.
- The pure totals pipeline (all five stages, simple/configurable rules).
- Unit tests (pure pipeline + service with mocked Prisma) and an HTTP smoke run.

### Out of scope (deferred)
- **Guest carts / cart merge on login.** Authenticated-only for now. The schema
  keeps `Cart.userId` nullable, so a guest-cart enhancement remains possible
  later without a migration.
- **Order placement.** Slice 2.
- **Stock validation / reservation.** Phase 5 (inventory ledger). The cart does
  **not** gate add/update on `InventoryItem.available`.
- **Discounts / coupons / promotions.** Out of PRD scope — `discountTotal` is
  always `0`, present only so the pipeline shape is complete.
- **Payment.** Out of PRD scope for the whole project.
- **Audit logging.** Cart mutations are low-sensitivity; the app-wide audit
  helper is a Phase-7 follow-up.

## Decisions (resolved during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Cart ownership | Authenticated-only, one cart per user | Simplest; matches "server-backed cart for logged-in users". Guest carts deferred. |
| Totals pipeline | Full five-stage shape, simple rules | Cart and order-review must share one path; build the shape now, keep rules trivial. |
| Pricing | Live current price on every read | Never persist a stale unit price in the cart; the snapshot belongs to the order (slice 2). |
| Stock | No stock gate in this slice | Inventory reservation/validation is Phase 5. |
| Config source | Env-backed via `@nestjs/config` | Matches existing `ConfigModule` usage; change rates per env, no migration. |
| API shape | Singular `/cart` (implicit-per-user) | Conventional for a per-user singleton; no cart id in URLs ⇒ no ownership-check bugs. |
| Authorization | `@Roles(Role.CUSTOMER)` on every route | Admins / inventory managers don't have carts. API-enforced, never trusted from client. |
| Money internally | Integer cents in the pipeline | Avoid float drift; serialize to 2-dp strings to match the existing money contract. |

## Architecture

New `cart/` module, mirroring the `products/` conventions (thin controller,
logic in service, DTOs validated at the boundary, `mapWriteError` for Prisma).

```
apps/api/src/cart/
  cart.module.ts          # wires controller + service (replaces the empty stub)
  cart.controller.ts      # @Roles(CUSTOMER); resolves @CurrentUser()
  cart.service.ts         # persistence + assembles the cart-with-totals envelope
  cart.config.ts          # reads TAX_RATE / SHIPPING_FLAT / FREE_SHIPPING_THRESHOLD
  totals.ts               # PURE pipeline: computeTotals(lines, config)
  totals.spec.ts
  cart.service.spec.ts
  dto/
    add-cart-item.dto.ts     # productId: string; quantity: int >= 1
    update-cart-item.dto.ts  # quantity: int >= 0
```

`CartModule` is already imported in `app.module.ts`; only its body changes.

### Totals pipeline (`totals.ts`) — pure, the heart of the slice

```
computeTotals(lines: TotalsLine[], config: TotalsConfig): CartTotals
```

- `TotalsLine` = `{ unitPriceCents: number; quantity: number }` — caller resolves
  the effective unit price (sale vs regular) before calling.
- `TotalsConfig` = `{ taxRate: number; shippingFlatCents: number; freeShippingThresholdCents: number }`.
- Computation (all integer cents):
  - `subtotal` = `Σ (unitPriceCents × quantity)`
  - `discountTotal` = `0`
  - `taxTotal` = `round(subtotal × taxRate)` (round half-up to the nearest cent)
  - `shippingTotal` = empty cart → `0`; else `subtotal ≥ freeShippingThresholdCents` → `0`; else `shippingFlatCents`
  - `grandTotal` = `subtotal − discountTotal + taxTotal + shippingTotal`
- Returns 2-dp **string** money fields (e.g. `"48.98"`) so the controller emits
  the same shape the storefront already consumes for product prices.

The effective-unit-price rule reuses the storefront's `isOnSale` semantics
(sale price applies when `salePrice` is non-null and `< price`), but lives
server-side here as the authority. Resolution happens in the service when it
maps DB rows → `TotalsLine`, keeping `totals.ts` free of Prisma types.

### Service (`cart.service.ts`)

- `getCart(userId)` — find the user's cart (with items + product price/status/
  primary image) or create an empty one; return the envelope.
- `addItem(userId, dto)` — validate product exists and is `ACTIVE`; upsert the
  `CartItem` on the `@@unique([cartId, productId])` constraint, incrementing
  quantity when the line already exists; return the envelope.
- `setItemQuantity(userId, productId, quantity)` — `quantity === 0` removes the
  line; otherwise sets the absolute quantity; return the envelope.
- `removeItem(userId, productId)` — delete the line (idempotent); return envelope.
- `clear(userId)` — delete all items in the cart; return envelope.
- Private `buildEnvelope(cart)` — maps items → `TotalsLine[]` (resolving sale
  price), calls `computeTotals` with the env config, and shapes the response.

### Controller (`cart.controller.ts`)

All routes `@Roles(Role.CUSTOMER)`. User id from `@CurrentUser().sub`. No cart id
in any path. `DELETE /cart/items/:productId` and `DELETE /cart` return the
updated envelope (HTTP 200), not 204, so the client always re-renders totals.

## API contract

### Response envelope (every endpoint returns this)
```jsonc
{
  "id": "ckcart...",
  "items": [
    {
      "productId": "ckprod...",
      "name": "Wireless Mouse",
      "unitPrice": "19.99",      // effective (sale if active), 2-dp string
      "quantity": 2,
      "lineTotal": "39.98",
      "image": "https://.../mouse.jpg" // primary image url or null
    }
  ],
  "totals": {
    "subtotal":      "39.98",
    "discountTotal": "0.00",
    "taxTotal":      "4.00",
    "shippingTotal": "5.00",
    "grandTotal":    "48.98"
  }
}
```

### Requests
- `POST /cart/items` → `{ "productId": "...", "quantity": 2 }`
- `PATCH /cart/items/:productId` → `{ "quantity": 3 }`

## Error handling

| Case | Status |
|---|---|
| Unauthenticated / non-CUSTOMER role | `401` / `403` (global guards) |
| Add/update unknown product | `404` |
| Add/update non-`ACTIVE` product (INACTIVE/ARCHIVED) | `400` |
| `POST` quantity `< 1` | `400` (class-validator) |
| `PATCH` quantity `< 0` | `400` (class-validator); `0` ⇒ remove (not an error) |
| Remove a line not in the cart | no-op, returns current envelope |
| Prisma `P2003` / `P2025` | `400` via `mapWriteError` |

## Configuration

`apps/api/.env` (template updated in `.env.example`), read in `cart.config.ts`
via `@nestjs/config` with defaults:

| Var | Default | Meaning |
|---|---|---|
| `TAX_RATE` | `0.10` | Fractional tax rate applied to subtotal |
| `SHIPPING_FLAT` | `5.00` | Flat shipping fee (currency units) when below threshold |
| `FREE_SHIPPING_THRESHOLD` | `50.00` | Subtotal at/above which shipping is free |

Values are parsed to integer cents inside `cart.config.ts` before reaching the
pure pipeline.

## Testing (TDD: red → green → refactor)

### `totals.spec.ts` (pure, exhaustive)
- Empty cart → all zeros, shipping `0`.
- Single line, no sale → subtotal = unit × qty.
- Multi-line subtotal sums correctly.
- Tax rounding (half-up) at a fractional boundary.
- Free-shipping threshold boundary: just below → flat fee; exactly at / above → `0`.
- `grandTotal` = subtotal − discount + tax + shipping.

### `cart.service.spec.ts` (mocked Prisma, mirrors `products.service.spec.ts`)
- get-or-create: returns existing cart; creates when none.
- add new line vs increment existing line.
- set absolute quantity; quantity `0` removes the line.
- remove line (and idempotent remove of absent line).
- clear empties the cart.
- add unknown product → `404`.
- add INACTIVE / ARCHIVED product → `400`.
- effective unit price uses sale price when active.

### Smoke (RULE.md §5 — real API vs `ecom_dev` over HTTP)
- CUSTOMER logs in, `GET /cart` (empty), adds items, sees correct totals,
  crosses the free-shipping threshold, sets qty, removes, clears.
- Role boundary: ADMIN / unauthenticated hit `403` / `401`.
- Add archived product → `400`; add unknown id → `404`.

**Coverage target:** 80% (advisory). Domain-critical pieces (the totals pipeline,
the add/increment and qty-0-removes paths) are covered exhaustively.

## Risks & considerations

- **Float drift in money math.** Mitigated by computing in integer cents and only
  formatting to 2-dp strings at the edge.
- **Pipeline divergence between cart and order review.** Mitigated by making
  `computeTotals` the single pure authority; slice 2 must reuse it, not
  reimplement it.
- **Concurrent add of the same product** could race on the unique constraint;
  handled by upsert/`P2002` tolerance so a double-add increments rather than 500s.
- **Live pricing means cart totals can change** between views if an admin edits a
  price — acceptable and correct (the order snapshot in slice 2 freezes price).

## Verification steps

1. `npm --prefix apps/api test` — unit suite green (existing + new).
2. `npm --prefix apps/api run lint` — clean.
3. `npm --prefix apps/api run build` — clean.
4. Start `npm --prefix apps/api run start:dev` against `ecom_dev`; run the smoke
   sequence above over HTTP; confirm statuses and totals.

## Suggested commit (spec)

```
docs(phase4): spec — API server-authoritative cart + totals pipeline
```
