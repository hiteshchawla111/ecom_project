# M5a S3 — SubOrder State Machine + Rollup + Seller API — Design

> **Date:** 2026-07-13
> **Phase:** M5a (Order Split) of M5. Depends on **S1** (SubOrder schema/backfill) + **S2** (placeOrder writes SubOrders) — both merged to `main`.
> **Branch:** `feat/order-split-s3` (off `main`).
> **Status:** Approved design. One slice, stop-and-verify (RULE.md §1); TDD the rollup + transition + scoping (RULE.md §4); smoke a multi-seller fulfillment flow vs `ecom_dev` (RULE.md §5).
> **Authoritative refs:** ADR-006 (Order=rollup, SubOrder=state machine), ADR-014 (reuse the pure state machine on SubOrder), `MIGRATION_PLAN.md` §2.3 (cursor pagination for SubOrder lists).

## Context

S1 created the `SubOrder`/`SubOrderItem` tables; S2 made `placeOrder` write 1 Order + N SubOrders and reserve stock per SubOrderItem (movements carry both `orderId`+`subOrderId`). But nothing transitions SubOrders yet — the live state machine + stock side-effects still run at the **Order** level (`OrdersService.updateStatus`, `orders.service.ts:~419-545`), and `Order.status` is written directly. S3 moves the state machine + stock onto `SubOrder`, makes `Order.status` a computed rollup, and adds the seller fulfillment API.

### Current state (verified)

- **Pure state machine** `orders/order-status.ts`: `OrderStatus` enum (7 values matching Prisma) + `ALLOWED_TRANSITIONS` + `assertTransition(from,to)` / `canTransition`. Ladder: `Pending → {Confirmed,Cancelled}`, `Confirmed → {Processing,Cancelled}`, `Processing → {Shipped,Cancelled}`, `Shipped → {Delivered}`, `Delivered → {Refunded}`, `Cancelled`/`Refunded` terminal. Pure, string-valued — reusable on `SubOrderStatus` (identical values) via the `as unknown as OrderStatusFlow` cast the current code already uses.
- **`updateStatus`** (Order-level): loads order, role-gates (ADMIN any valid transition; CUSTOMER self-cancel `PENDING→CANCELLED` only, else 403; foreign order → 404), `assertTransition`, then `movesStock(next)` → per-`OrderItem` `applyStockForStatus` in a `$transaction` + `order.update({status})` + audit (`ORDER_STATUS_CHANGED`, `REFUND_ISSUED` on REFUNDED) + post-commit `ORDER_STATUS_CHANGED_EVENT`.
- **`applyStockForStatus(status, productId, quantity, orderId, tx)`**: CANCELLED→`release`, SHIPPED→`deduct`, REFUNDED→`restock`. **`movesStock`**: true for CANCELLED/SHIPPED/REFUNDED.
- **Inventory** `release`/`deduct`/`restock` are `(productId, quantity, orderId?, tx?)`. S2 already extended `reserve` with a 5th `subOrderId?` param; `apply`'s `move` object already writes `subOrderId ?? null`.
- **Seller scoping (M2, ADR-008):** `SellerApprovedGuard` (`sellers/guards/seller-approved.guard.ts`) — DB-authoritative ACTIVE check, **ADMIN bypass** (returns true, attaches no sellerId), attaches `request.sellerId` (the `Seller.id` string). `@CurrentSeller()` (`auth/decorators/current-seller.decorator.ts`) returns the sellerId **string**. `buildSellerScope(actor: ScopeActor): { sellerId?: string }` (`products/seller-scope.ts`) → SELLER `{sellerId}`, ADMIN/INV `{}` (cross-seller), SELLER-without-id throws. `JwtAuthGuard`+`RolesGuard` are global `APP_GUARD`s; seller controllers add `@UseGuards(SellerApprovedGuard)` + `@Roles(SELLER)` + a private `actor(sellerId): ScopeActor` helper.
- **Cursor pagination** template: `reviews.service.ts` `listPublic` — `orderBy [{publishedAt:'desc'},{id:'desc'}]`, `take: limit+1`, cursor `"<iso>_<id>"`, `decodeCursor` splitting on the last `_`. SubOrder has `@@index([sellerId, status, createdAt])` (S1) backing the queue.
- **Events + notifications:** `ORDER_STATUS_CHANGED_EVENT = 'order.status.changed'` (`orders/orders-events.ts`) is consumed by M4b `OrderNotificationListener` → customer SHIPPING_UPDATE/DELIVERY_UPDATE notifications (keyed on **Order** status). No SubOrder view/DTO/read exists yet. Admin order reads (`admin-orders.controller.ts`, `getAnyOrder`/`listAllOrders`) are `OrderItem`-based — S3 does not touch them.

## Decisions (approved)

1. **SubOrder is the transition unit; `Order.status` is a computed rollup** (never written directly by a transition). The old Order-level arbitrary-status write is removed.
2. **Rollup rule (`rollupOrderStatus`)** — least-advanced non-terminal, all-terminal collapses (details below). Single-seller order → the one suborder's status (identical to legacy behavior).
3. **Admin transitions via the seller endpoint's ADMIN bypass** — `SellerApprovedGuard` passes admins and `buildSellerScope` returns `{}`, so an admin can transition **any** suborder through the same `PATCH /seller/suborders/:id/status`. No separate admin route in S3 (an `/admin/suborders` UI route is S4 if wanted).
4. **Events:** always emit `suborder.status.changed`; emit the existing `ORDER_STATUS_CHANGED_EVENT` **only when the rollup actually changes `Order.status`** — so M4b customer notifications keep firing at the order level, unchanged.
5. **Order-level `PATCH /orders/:id/status` narrows to customer self-cancel** — cancelling means cancelling all the order's (PENDING) SubOrders + rollup to CANCELLED. Admin dropped from this route.

## The rollup function (pure)

`orders/rollup-order-status.ts`: `rollupOrderStatus(statuses: SubOrderStatus[]): OrderStatus` — pure, DB-free, exhaustively unit-tested.

- **Rank ladder** (explicit map, owned here — the state machine defines transitions, not a linear rank): `PENDING(0) < CONFIRMED(1) < PROCESSING(2) < SHIPPED(3) < DELIVERED(4) < REFUNDED(5)`. (`REFUNDED` ranks above `DELIVERED` per `Delivered → Refunded`.)
- **All-terminal collapse:** every status `CANCELLED` → `CANCELLED`; every status `REFUNDED` → `REFUNDED`.
- **Otherwise, active set = statuses excluding `CANCELLED`** (a partially-cancelled order rolls up over what remains). `Order.status` = the **least-advanced** (min rank) in the active set.
  - Empty input or all-cancelled → `CANCELLED` (guarded).
  - Single active suborder → that suborder's status (legacy parity).
- Returns a Prisma `OrderStatus`. Casting between `SubOrderStatus` and `OrderStatus` is safe (identical value sets).

## SubOrder transition service (`OrdersService.transitionSubOrder`)

`transitionSubOrder(actor: { sub: string; role: Role; sellerId?: string }, subOrderId: string, nextStatus: SubOrderStatus): Promise<SubOrderView>`

1. **Load + ownership scope:** `prisma.subOrder.findFirst({ where: { id: subOrderId, ...buildSellerScope(scopeActor) }, include: { items: true, order: { select: { id, userId } } } })`. Null → `NotFoundException('Sub-order not found')` (seller touching another's suborder → 404; admin scope `{}` sees all).
2. **Guard:** `assertTransition(subOrder.status, nextStatus)` → `ConflictException` on `InvalidOrderTransitionError` (same mapping as today).
3. **`$transaction`:**
   - If `movesStock(nextStatus)`: per **SubOrderItem**, `applyStockForStatus(nextStatus, item.productId, item.quantity, subOrder.orderId, tx, subOrderId)` (CANCELLED→release, SHIPPED→deduct, REFUNDED→restock — now passing `subOrderId`).
   - `tx.subOrder.update({ where: { id: subOrderId }, data: { status: nextStatus } })`.
   - **Rollup:** `siblings = tx.subOrder.findMany({ where: { orderId: subOrder.orderId }, select: { status: true } })` (reflects the just-applied update), `rolled = rollupOrderStatus(siblings.map(s => s.status))`; if `rolled !== order.status`, `tx.order.update({ where: { id: orderId }, data: { status: rolled } })` and set `orderStatusChanged = true` + `newOrderStatus = rolled`.
   - **Audit:** `SUBORDER_STATUS_CHANGED` (new audit action) on the SubOrder `{ from, to, sellerId }`; if `nextStatus === REFUNDED`, also `REFUND_ISSUED` on the SubOrder `{ grandTotal }`. **Audit constant value = `'suborder.status-changed'`** (hyphen, deliberately NOT `'suborder.status.changed'`) so it does **not** collide with the `SUBORDER_STATUS_CHANGED_EVENT` string — avoiding the latent event↔audit collision already flagged for `ORDER_STATUS_CHANGED`. `entityType: 'SubOrder'`.
4. **Post-commit emits:** always `SUBORDER_STATUS_CHANGED_EVENT { subOrderId, orderId, sellerId, status }`; if `orderStatusChanged`, also `ORDER_STATUS_CHANGED_EVENT { orderId, userId: order.userId, status: newOrderStatus }`.
5. Returns a `SubOrderView` (new — see below).

Lives in `OrdersService` (shares `applyStockForStatus`/`movesStock`/`audit`/`events`). The `scopeActor` is `{ role, sellerId }` built from `@CurrentSeller` + `@CurrentUser` in the controller.

## Inventory threading (additive, mirrors S2's `reserve`)

Extend `release`, `deduct`, `restock` signatures to `(productId, quantity, orderId?, tx?, subOrderId?)`; each forwards `subOrderId` into `apply`'s `move` object (which already writes `subOrderId ?? null` since S2). Existing Order-level callers omit it (→ null) — unaffected. `applyStockForStatus` gains a `subOrderId` param it threads through.

## Seller SubOrder API

**`SellerSubOrdersController`** — `@Controller('seller/suborders')`, `@Roles(Role.SELLER)`, `@UseGuards(SellerApprovedGuard)`, private `actor(sellerId): ScopeActor` helper (mirrors `SellerProductsController`).

| Method | Route | Behavior |
|---|---|---|
| `GET` | `/seller/suborders` | Cursor-paginated fulfillment queue, scoped via `buildSellerScope`. Query `ListSubOrdersDto { cursor?, limit? (1..50, default 20), status? (SubOrderStatus filter) }`. `orderBy [{createdAt:'desc'},{id:'desc'}]`, `take: limit+1`, cursor `"<iso>_<id>"`. Returns `{ data: SubOrderView[], nextCursor: string | null }`. Uses the `[sellerId,status,createdAt]` index. |
| `PATCH` | `/seller/suborders/:id/status` | `@CurrentSeller() sellerId` + `@CurrentUser() user` + `UpdateSubOrderStatusDto { status: SubOrderStatus }`. Calls `transitionSubOrder({ sub: user.sub, role: user.role, sellerId }, id, dto.status)`. **404** if not the seller's (admin bypass = any); **409** invalid transition. Returns the updated `SubOrderView` (200). |

Admin (via global guards + `SellerApprovedGuard` admin-bypass, `buildSellerScope`→`{}`) can hit both — cross-seller queue + transition any suborder.

**`SubOrderView`** = `{ id, orderId, status, subtotal, discountTotal, taxTotal, shippingTotal, grandTotal, shipFullName, shipLine1, shipLine2, shipCity, shipState, shipCountry, shipPostalCode, items: SubOrderItemView[], createdAt }`; `SubOrderItemView = { productId, productName, unitPrice, quantity, lineTotal, sellerName }`. Money as 2-dp strings (the `money()` helper pattern). No cross-seller/PII leak (a seller sees only their own suborders; `sellerName` is public).

## Order-level `updateStatus` rework

`PATCH /orders/:id/status` narrows to **customer self-cancel**; `@Roles` drops to `CUSTOMER`.
- Load order + its suborders. Ownership: `order.userId === actor.sub` else `NotFoundException`.
- Only honored transition: order fully cancellable — **every** SubOrder is `PENDING`, and `dto.status === CANCELLED`. Otherwise `ForbiddenException`/`ConflictException` (matches today's "cancel while pending" semantics; a partially-progressed order can't be self-cancelled).
- In one `$transaction`: for each SubOrder, apply `PENDING → CANCELLED` (release stock via `subOrderId`), then `rollupOrderStatus` → `CANCELLED` (all-cancelled collapse), `order.update`. Audit per suborder + order. Post-commit: one `SUBORDER_STATUS_CHANGED_EVENT` per suborder + one `ORDER_STATUS_CHANGED_EVENT` (rollup changed).
- Returns `toOrderView(order)` — **response shape unchanged**.
- **Admin removed** from this route (transitions per-suborder via the seller endpoint). Net: stock only ever moves through a SubOrder transition; no orphaned Order-level stock writes remain.

## Events

`orders/orders-events.ts` adds:
```ts
export const SUBORDER_STATUS_CHANGED_EVENT = 'suborder.status.changed';
export interface SubOrderStatusChangedEvent {
  subOrderId: string; orderId: string; sellerId: string; status: SubOrderStatus;
}
```
`ORDER_STATUS_CHANGED_EVENT` unchanged (still consumed by M4b for customer order-level notifications). No new listener in S3 (a `suborder.status.changed` consumer arrives with M5c logistics / seller notifications).

**Collision avoided proactively:** the new audit action uses `'suborder.status-changed'` (hyphen) while the event uses `'suborder.status.changed'` (dots) — distinct strings, so unlike the pre-existing `ORDER_STATUS_CHANGED` event↔audit collision (tracked for M7d), S3 introduces no new collision.

## Testing (TDD — API Jest)

- **`rollupOrderStatus` (pure):** single suborder → its status (all 7); all-CANCELLED → CANCELLED; all-REFUNDED → REFUNDED; mixed `[PENDING, SHIPPED]` → PENDING (least-advanced); `[CONFIRMED, DELIVERED]` → CONFIRMED; partial cancel `[CANCELLED, PROCESSING]` → PROCESSING (cancelled excluded); `[DELIVERED, REFUNDED]` → DELIVERED; `[CANCELLED, CANCELLED, DELIVERED]` → DELIVERED.
- **`transitionSubOrder` (service, mocked tx):** ownership 404 (seller scope; admin bypass sees all); invalid transition → 409; stock op fires per SubOrderItem with `subOrderId` (SHIPPED→deduct, CANCELLED→release, REFUNDED→restock); `Order.status` rolled up in-tx and written only when changed; audit rows (`SUBORDER_STATUS_CHANGED`, `REFUND_ISSUED` on REFUNDED); post-commit emits — always suborder event, order event only on rollup change; returns `SubOrderView`.
- **`SellerSubOrdersController` (mocked service):** list delegates with `actor(sellerId)` + cursor/limit/status; PATCH delegates with `{sub,role,sellerId}`; admin (no sellerId) still routes.
- **Seller queue list (service):** `buildSellerScope` spread into `where`; cursor keyset `createdAt DESC, id DESC`; `take limit+1` / `nextCursor` encode/decode; `status` filter; admin unscoped.
- **Order-level `updateStatus` rework:** customer self-cancel of all-PENDING order → all suborders CANCELLED + Order CANCELLED + stock released; partially-progressed → rejected; foreign order → 404; admin no longer permitted; response shape unchanged.
- **inventory `release`/`deduct`/`restock`:** movement carries `subOrderId` when passed; null when omitted (existing callers).

## Verification gate (RULE.md §5)

1. `npm test` (API) green incl. new specs; `npx tsc --noEmit` 0 new (3 known pre-existing); `npm run lint` clean on changed files.
2. **Live HTTP smoke vs `ecom_dev`** (fresh boot; kill stale :5000 first):
   - Place a **2-seller** order (S2 flow) → 1 Order (PENDING) + 2 SubOrders (PENDING).
   - As **seller A**: `GET /seller/suborders` shows only A's suborder; transition it `PENDING→CONFIRMED→PROCESSING→SHIPPED` — assert stock **deducts** on SHIPPED (movement carries subOrderId), Order rolls up to PENDING while B is still PENDING, then to the least-advanced as B progresses.
   - Seller A can't touch B's suborder → **404**; invalid transition → **409**.
   - As **admin**: `GET /seller/suborders` cross-seller; transition B's suborder (admin bypass).
   - Drive both to DELIVERED → Order rolls up to DELIVERED. Refund one → its stock **restocks**, Order rolls up per rule.
   - **Customer self-cancel:** a fresh all-PENDING order → `PATCH /orders/:id/status {CANCELLED}` cancels both suborders (stock **released**) + Order CANCELLED; a partially-shipped order → self-cancel **rejected**.
   - M4b: customer gets a SHIPPING_UPDATE notification only when the **Order** rolls to SHIPPED (order-level event fired once).
   - `GET /orders/:id` response shape unchanged. Clean up test data; confirm `ecom_dev` baseline.

## Out of scope (YAGNI — S3)

Storefront/admin/seller read-path **UI** (per-seller order groups, admin Order+SubOrders view, seller queue page) — S4. Admin order read endpoints (`admin-orders`) stay OrderItem-based — untouched. A `suborder.status.changed` **consumer/listener** (logistics/seller notifications) — M5c/later. Dropping `OrderItem` — Wave C4. No migration.

## Risks

- **Rollup drift** → recomputed in the SAME `$transaction` as every SubOrder status write; never written independently.
- **Cross-seller leak / wrong-suborder transition** → `buildSellerScope` ownership `findFirst` → 404; admin bypass is explicit. Tests + review.
- **Stock double-move / wrong ref** → stock moves only through a SubOrder transition, per SubOrderItem, passing `subOrderId`; the Order-level stock path is removed. Total released/deducted per product matches the reserved quantity.
- **M4b notification regression** → order-level event still fires (only when rollup changes); no M4b change; asserted in smoke.
- **Shared `ecom_dev`** → smoke cleans up; no migration.
- **Event/audit string collision** → avoided proactively: audit action `'suborder.status-changed'` (hyphen) vs event `'suborder.status.changed'` (dots) are distinct. No new collision introduced.
