# M5a S2 — placeOrder Writes SubOrders — Design

> **Date:** 2026-07-13
> **Phase:** M5a (Order Split) of M5. Depends on **M5a S1** (SubOrder schema + backfill, merged to `main`).
> **Branch:** `feat/order-split-s2` (off `main`).
> **Status:** Approved design. One slice, stop-and-verify (RULE.md §1); TDD the grouping/totals/reservation (RULE.md §4); smoke-run a multi-seller checkout vs `ecom_dev` (RULE.md §5).
> **Authoritative refs:** ADR-006 (Order→SubOrder topology), ADR-014 (pure totals run per-seller + aggregate), `MIGRATION_PLAN.md` §2.3 ("keep `OrderItem` during the deprecation window").

## Context

S1 added the `SubOrder`/`SubOrderItem` tables + `SubOrderStatus` enum + `InventoryMovement.subOrderId` (all additive, on `main`), and backfilled every legacy `Order` to one Platform-Seller `SubOrder`. **Nothing writes SubOrders on the live path yet.** S2 makes checkout produce them.

**S2 objective.** Rewrite `OrdersService.placeOrder` so a multi-seller cart becomes **1 `Order` + N `SubOrder`s** (one per distinct seller): each SubOrder carries its own per-seller totals, item snapshots, and shipping-address snapshot; stock is reserved per SubOrderItem with movements referencing `subOrderId`. The `Order` keeps its aggregate totals **and** its `OrderItem`s (dual-write), so every existing read path keeps working unchanged.

### Current `placeOrder` (verified in `orders.service.ts:125-213`)

Loads the cart (`CART_FOR_CHECKOUT` include — currently selects `product {name, price, salePrice, status, deletedAt}`, **no sellerId**), re-validates each line, calls `priceItems(pricingItems, this.totalsConfig)` **once over all lines**, then in one `$transaction`: `tx.order.create` (aggregate totals + nested `OrderItem`s), loops `inventory.reserve(productId, quantity, orderId, tx)` collecting low-stock crossings, clears the cart. Post-commit: emits low-stock crossings then `ORDER_PLACED { orderId, userId }`. Returns `toOrderView(order)`.

### Key current signatures (verified)

- `priceItems(items: PricingItem[], config): { lines: PricedLine[]; totals: CartTotals }` — pure (`cart/cart-pricing.ts`). `PricingItem = { productId, quantity, product: {name, price, salePrice}, imageUrl? }`. `PricedLine = { productId, name, unitPrice, quantity, lineTotal, imageUrl? }`.
- `computeTotals`/`priceItems` return `CartTotals` = **five 2-dp money strings only** (`cart/totals.ts`) — no cents exposed. `centsToString(cents): string` is exported there. Internal math is integer cents.
- `inventory.reserve(productId, quantity, orderId?, tx?): Promise<LowStockEvent | null>` → private `apply(itemId, { counters, type, delta, orderId?, reason? }, tx?)` writes `inventoryMovement.create({ …, orderId: move.orderId ?? null })`. The movement model has `subOrderId String?` (S1) but nothing writes it yet.
- `SubOrder` requires: `orderId`, `sellerId`, `status`, 5 money (`Decimal(12,2)`), 7 ship fields. `SubOrderItem` requires: `subOrderId`, `productId`, `productName`, `unitPrice`, `quantity`, `lineTotal`, `sellerName`. `sellerName` snapshot = `Seller.displayName`.

## Decisions (approved)

1. **Per-seller pipeline; Order = exact sum of SubOrders.** Run the pure `priceItems` once per seller-group on that group's lines — each SubOrder gets its own `subtotal/discount/tax/shipping/grandTotal` (flat shipping + free-shipping threshold applied **per seller**, the intended marketplace behavior, ADR-014). The `Order`'s five money columns are the exact **integer-cents sum** of its SubOrders, so `Order.grandTotal === Σ SubOrder.grandTotal` (and each component) holds by construction. A multi-seller cart may now incur shipping per seller — deliberate change from today's single-cart shipping.
2. **Reserve writes both refs.** Extend `reserve` (and private `apply`) with an optional `subOrderId`; write **both** `orderId` and `subOrderId` on the movement. Additive — existing callers unaffected, existing `orderId` reads unbroken. (`release`/`deduct`/`restock` get the same treatment in S3, when stock side-effects move onto SubOrder.)
3. **Dual-write `OrderItem`.** `placeOrder` creates the `Order` with aggregate totals **and** all `OrderItem`s (exactly today's shape) **plus** the N SubOrders + SubOrderItems. Existing read paths (storefront/admin order detail, analytics) stay on `OrderItem`, unchanged. `OrderItem` drop is the later Wave C4.
4. **`updateStatus` untouched in S2.** It still transitions `Order.status` and moves stock by `orderId` as today. The state machine moving onto SubOrder + rollup is S3. The `GET /orders/:id` response shape is **identical** to today (SubOrders not surfaced until S4).

## Architecture / units

- **`orders/group-by-seller.ts`** (new, pure): groups the validated **cart lines** by seller. `PricingItem` carries **no** seller field (verified — `cart-pricing.ts`), and `PricedLine` links back only by `productId`; so grouping must key off each cart line's `product.seller` (from the extended include) and produce, per seller, that group's already-built `PricingItem[]`. Signature: `groupCartLinesBySeller(lines: SellerLine[]): SellerGroup[]` where `SellerLine = { sellerId: string; sellerName: string; item: PricingItem }` (the validation step builds one `SellerLine` per cart line, pairing the seller pulled from `product.seller` with the `PricingItem` it constructs) and `SellerGroup = { sellerId: string; sellerName: string; items: PricingItem[] }`. Deterministic order (sort by `sellerId`). Throws if a line has no resolvable seller (can't happen — `Product.sellerId` non-null since M2 — but fail loud rather than drop a line).
- **`orders/sum-totals.ts`** (new, pure): `sumTotals(parts: CartTotals[]): CartTotals` — sums each of the five fields by parsing the 2-dp strings to integer cents, adding, and formatting via the existing `centsToString`. No float. (Needed because the pipeline exposes only formatted strings; summing formatted strings naively would risk drift, so we parse→cents→sum→format.) A tiny `moneyStringToCents(s): number` local helper (inverse of `centsToString`) backs it.
- **`orders.service.ts`** `placeOrder` rewrite + `CART_FOR_CHECKOUT` include gains `product.seller { select: { id, displayName } }`.
- **`inventory.service.ts`** `reserve` + `apply` gain optional `subOrderId`.

## Data flow (the rewritten `placeOrder`)

1. Load cart with the extended include (now fetches `product.seller {id, displayName}`). Empty → 400 (unchanged).
2. Per-line validation (deleted/inactive → 400, unchanged), building one `SellerLine` per cart line = `{ sellerId, sellerName }` (from the loaded `product.seller`) + the `PricingItem` constructed as today.
3. `groupCartLinesBySeller(sellerLines)` → `SellerGroup[]`.
4. Per group: `priceItems(group.items, totalsConfig)` → `{ lines, totals }`. Keep each group's `{ sellerId, sellerName, pricedLines, totals }`.
5. `orderTotals = sumTotals(groups.map(g => g.totals))`.
6. **One `$transaction`:**
   - `tx.order.create` with `orderTotals` (5 fields) + 7 ship fields from `dto` + nested `items.create` = **all** priced lines across every group (dual-write, shape identical to today).
   - For each group: `tx.subOrder.create` with `{ orderId: order.id, sellerId, status: PENDING, <group totals>, <same 7 ship fields>, items: { create: pricedLines.map(→ {productId, productName, unitPrice, quantity, lineTotal, sellerName}) } }`.
   - For each line in the group: `inventory.reserve(line.productId, line.quantity, order.id, tx, subOrder.id)` → collect low-stock crossings. Insufficient stock throws → whole tx rolls back (unchanged behavior).
   - `tx.cartItem.deleteMany({ cartId })`.
7. Post-commit (unchanged): emit low-stock crossings; emit `ORDER_PLACED { orderId, userId }`. No `suborder.*` event (S3).
8. `return toOrderView(order)` — response shape identical to today.

**Reserve total invariant:** total reserved per product = Σ across groups = the original cart quantity for that product (grouping partitions lines, never duplicates).

## Inventory change (additive)

`reserve(productId, quantity, orderId?, tx?, subOrderId?)` — appended optional param; passes `subOrderId` into `apply`, whose `move` object gains `subOrderId?`, written as `inventoryMovement.create({ …, orderId: move.orderId ?? null, subOrderId: move.subOrderId ?? null })`. When `subOrderId` is omitted (any non-order caller), it's `null` — no behavior change. Only `reserve` is extended in S2; `release`/`deduct`/`restock` in S3.

## Error handling

- Empty cart → `BadRequestException` (unchanged).
- Any line deleted/inactive → `BadRequestException` (unchanged).
- Insufficient stock on any line → transaction rolls back (unchanged; no Order/SubOrders persisted).
- `groupCartLinesBySeller` sees a line with no seller → throws a descriptive error (defensive; unreachable in practice).

## Testing (TDD — API Jest, mirror `orders.service.spec.ts` + S1 backfill specs)

**`groupCartLinesBySeller` (pure):** single-seller → 1 group; multi-seller → N correctly-partitioned groups in deterministic order; `sellerName` from `product.seller.displayName`; throws on missing seller.

**`sumTotals` (pure):** sums each of the 5 fields correctly (incl. a case where two groups each pay flat shipping → shipping sums, not dedupes); parse→cents→format round-trips exactly (e.g. `["48.98","10.00"]` → `"58.98"`); no float drift on a `.5`-boundary case.

**`placeOrder` (service, mocked tx + mocked inventory):**
- 1 Order created with `sumTotals` aggregate + **all** OrderItems (dual-write shape unchanged);
- N SubOrders, each `status=PENDING`, correct `sellerId`, its group totals, the 7 ship fields copied, SubOrderItems with correct `sellerName`;
- **parity:** `Order.grandTotal === Σ SubOrder.grandTotal` (and per component) on a 2-seller fixture;
- multi-seller-below-threshold fixture → shipping charged **per seller** (marketplace semantics), Order = sum;
- `reserve` called once per line with `(productId, quantity, orderId, tx, subOrderId)` — asserts `subOrderId` = the owning SubOrder's id;
- insufficient stock → rejects (rollback); cart cleared; `ORDER_PLACED` emitted post-commit; `toOrderView` output shape unchanged;
- single-seller cart → 1 Order + 1 SubOrder (parity with backfilled legacy shape).

**`inventory.reserve`/`apply`:** movement carries **both** `orderId` and `subOrderId` when `subOrderId` passed; still works (`subOrderId: null`) when omitted.

## Verification gate (RULE.md §5)

1. `npm test` (API) — full suite green incl. new/updated specs; `npx tsc --noEmit` 0 new errors (3 known pre-existing M2/M3 spec errors).
2. **Live HTTP smoke vs `ecom_dev`** (fresh boot; guard against stale :5000 per memory):
   - Cart with products from **≥2 distinct sellers** (platform + demo seller). Place order → **1 Order + 2 SubOrders**; each SubOrder's per-seller totals correct; `Order.grandTotal == SubOrder1 + SubOrder2`; `count(OrderItem) == total lines`; each SubOrderItem `sellerName` correct.
   - Placement movements carry both `orderId` and `subOrderId`; reserved counts correct per product.
   - Single-seller cart → 1 Order + 1 SubOrder.
   - `GET /orders/:id` response unchanged vs today.
   - Clean up test data (shared DB); confirm counts back to baseline.

## Out of scope (YAGNI — S2)

State machine on SubOrder + `rollupOrderStatus` + `suborder.status.changed` + seller suborder API (S3); `release`/`deduct`/`restock` subOrderId threading (S3); storefront/admin/seller read paths + UI (S4); dropping `OrderItem` (Wave C4); coupons/discounts (M6b — `discountTotal` stays 0).

## Risks

- **Totals rounding drift** across per-seller aggregation → sum in integer cents via `sumTotals` (parse→cents→format with existing `centsToString`), never sum formatted strings; parity asserted in tests + live.
- **Read-path breakage** → dual-write keeps `Order`+`OrderItem` exactly as today; `toOrderView`/response shape unchanged; asserted in tests + live `GET /orders/:id`.
- **Lost/duplicated stock reservation** → grouping partitions lines (no dup); per-line reserve inside the seller loop; total-reserved invariant asserted.
- **Cross-tenant seller data** → `sellerName` is a public field (`displayName`); no KYC/PII copied into SubOrder/SubOrderItem.
- **Shared `ecom_dev`** → smoke cleans up; no migration in S2 (schema already on `main`).
