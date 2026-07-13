# M5a S1 — SubOrder Schema + Backfill — Design

> **Date:** 2026-07-13
> **Phase:** M5a (Order Split) of M5 — the keystone phase (`docs/IMPLEMENTATION_PLAN.md`).
> **Branch:** `feat/order-split` (off `main`).
> **Status:** Approved design. Implement one slice, stop-and-verify (RULE.md §1); TDD the backfill logic (RULE.md §4); smoke-run the migration + backfill vs `ecom_dev` (RULE.md §5).
> **Authoritative refs:** `MIGRATION_PLAN.md` §2.3 (Wave C1→C3), `DOMAIN_MODEL.md` §3.5, ADR-006 (Order→SubOrder topology), ADR-014 (pure totals/state-machine run per-seller).

## Context

M5a splits a multi-seller cart into one `Order` + N `SubOrder`s, moves the order state machine + stock side-effects onto `SubOrder`, and makes `Order.status` a rollup. It is **XL**, so it is sliced:

- **S1 — Schema + backfill (this spec):** the additive data foundation. `SubOrder`/`SubOrderItem` tables + `SubOrderStatus` enum + `InventoryMovement.subOrderId`; idempotent backfill of every existing `Order` → one Platform-Seller `SubOrder`. **Zero behavior change.**
- **S2 — placeOrder writes SubOrders:** group cart lines by `Product.sellerId`, run the pure totals pipeline per seller-group, create 1 `Order` + N `SubOrder`s (+items), reserve stock per SubOrderItem (movements set `subOrderId`).
- **S3 — State machine + rollup:** move the state machine onto `SubOrder.status`; `updateStatus` transitions a SubOrder + `rollupOrderStatus` recomputes `Order.status` same-tx; stock side-effects key off SubOrder transitions; `suborder.status.changed` event; seller suborder API.
- **S4 — Read paths / UI:** storefront per-seller order groups; admin Order+SubOrders; seller fulfillment queue.

### Why S1 is a pure foundation (verified against current code)

- **State machine** (`apps/api/src/orders/order-status.ts`) is pure and Order-agnostic — it moves onto `SubOrder` unchanged in S3. Not touched in S1.
- **Totals** (`apps/api/src/cart/totals.ts` `computeTotals`, `cart-pricing.ts` `priceItems`) are pure and callable on any line subset — run per seller-group in S2. Not touched in S1.
- **Inventory movements** reference a bare `orderId String?` (no FK, index-only) via the 3rd positional arg of `reserve/release/deduct/restock` (`inventory.service.ts`). S1 only **adds** a parallel nullable `subOrderId` column; the rethreading happens in S2/S3.
- **`OrderItem` has no `sellerId`** today — seller is derived via `Product.sellerId`. S1 doesn't need this (backfill uses the Platform Seller); S2 does the grouping.
- **Platform Seller** = the `Seller` row with `slug: 'platform'` (seeded via upsert in `prisma/seed.ts:61`).

After S1: `placeOrder`, `updateStatus`, and every read path behave **exactly as today**; the new tables exist and are backfilled, but nothing in a request path reads them.

## Decisions (approved)

1. **S1 = schema + backfill only.** No placeOrder/state-machine/rollup/inventory/API/UI changes. `OrderItem` is **kept** (its drop is the later Wave C4 contract migration).
2. **Migration authoring: file-diff + `prisma migrate deploy`** — never `migrate dev`/`reset` (shared `ecom_dev`; sibling worktree migrations must survive). Matches the repo precedent (Review + notification-enum migrations).
3. **Backfill: idempotent maintenance script + validation asserts** — standalone `backfill-suborders.ts` (mirrors `backfill-rating-aggregates.ts`), skip-if-exists, re-runnable, asserts row-count + totals parity.
4. **Deferred relations.** `SubOrder`'s `shipments`/`returnRequests`/`payout` back-relations (DOMAIN_MODEL §3.5) are **not** added in S1 — those models don't exist until M5c/M6. Add only fields that compile now; the back-relations land with their tables.

## Schema (C1 + C2) — additive to `apps/api/prisma/schema.prisma`

**`SubOrderStatus` enum** — same 7 values as `OrderStatus`:
`PENDING CONFIRMED PROCESSING SHIPPED DELIVERED CANCELLED REFUNDED`.

**`SubOrder`** (new):
```prisma
model SubOrder {
  id            String         @id @default(cuid())
  order         Order          @relation(fields: [orderId], references: [id])
  orderId       String
  seller        Seller         @relation(fields: [sellerId], references: [id])
  sellerId      String
  status        SubOrderStatus @default(PENDING)   // state machine runs here (S3)
  subtotal      Decimal  @db.Decimal(12,2)
  discountTotal Decimal  @db.Decimal(12,2) @default(0)
  taxTotal      Decimal  @db.Decimal(12,2) @default(0)
  shippingTotal Decimal  @db.Decimal(12,2) @default(0)
  grandTotal    Decimal  @db.Decimal(12,2)
  shipFullName   String
  shipLine1      String
  shipLine2      String?
  shipCity       String
  shipState      String
  shipCountry    String
  shipPostalCode String
  items         SubOrderItem[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([orderId])
  @@index([sellerId, status, createdAt])
  @@index([status])
}
```

**`SubOrderItem`** (new):
```prisma
model SubOrderItem {
  id          String   @id @default(cuid())
  subOrder    SubOrder @relation(fields: [subOrderId], references: [id], onDelete: Cascade)
  subOrderId  String
  productId   String
  productName String
  unitPrice   Decimal  @db.Decimal(12,2)
  quantity    Int
  lineTotal   Decimal  @db.Decimal(12,2)
  sellerName  String
  @@index([subOrderId])
  @@index([productId])
}
```

**`Order`** — add back-relation only: `subOrders SubOrder[]`. `Order.status` column unchanged (becomes a rollup in S3).
**`Seller`** — add back-relation only: `subOrders SubOrder[]`.

**`InventoryMovement`** (C2) — add:
```prisma
  subOrderId String?          // nullable; new SubOrder-driven movements (S2/S3) set this
  @@index([subOrderId])
```
Mirrors the existing index-only `orderId String?` (no FK). `orderId` stays.

**Migration:** edit `schema.prisma`; generate additive DDL via `prisma migrate diff` (from a temp shadow or `--from-migrations` → `--to-schema-datamodel`) into a hand-placed folder `prisma/migrations/<ts>_add_suborder/migration.sql`; apply with `migrate deploy`. C1 + C2 ship as **one additive migration** (they land together). No drops, no NOT-NULL-on-existing, no data-loss ops. `prisma generate` regenerates the client.

## Backfill (C3) — `apps/api/scripts/backfill-suborders.ts`

Standalone idempotent maintenance script (mirrors `backfill-rating-aggregates.ts`): own `PrismaClient` built the repo way — `import 'dotenv/config'` + `new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) })` (the Prisma 7 driver-adapter pattern the existing scripts use) — logs progress + summary, run manually in the `migrate deploy` window. Core logic extracted into a testable `backfillSubOrders(prisma): Promise<BackfillResult>` (takes an injected client) so the script file is a thin `main()` wrapper that constructs the client and calls it.

**Algorithm:**
1. Resolve Platform Seller once: `prisma.seller.findUnique({ where: { slug: 'platform' } })`. Missing → throw a clear error (seed must have run); non-zero exit.
2. Select orders with **no** SubOrder (idempotency guard): `order.findMany({ where: { subOrders: { none: {} } }, include: { items: true } })`. Optional cursor batching (`--batch=N`) for production scale; instant on `ecom_dev`.
3. Per order, in a `$transaction`: create one `SubOrder` (`sellerId = platform.id`, `status = order.status`, copy the 5 money columns verbatim + the 7 `ship*` fields), then a `SubOrderItem` per `OrderItem` (copy `productId`/`productName`/`unitPrice`/`quantity`/`lineTotal`, `sellerName = 'Platform'`).
4. Does **not** touch `OrderItem`.

**Validation (asserts at end; throw + non-zero exit on failure):**
- `count(Order) === count(distinct SubOrder.orderId)` (one SubOrder per order).
- `count(OrderItem) === count(SubOrderItem)` (no line lost/duplicated).
- Totals parity: every `Order.grandTotal === its SubOrder.grandTotal` (single-seller ⇒ equal).

**Safety:** idempotent (skip-if-`subOrders:none`), transactional per order, re-runnable (2nd run creates nothing). Legacy single-seller orders get one SubOrder whose status equals the order's — so the S3 rollup yields the identical `Order.status` (no legacy behavior change).

## Testing (TDD — API Jest)

**`backfillSubOrders` unit tests** (mock/seeded Prisma), mirroring the rating-aggregate backfill test:
- one SubOrder per order (sellerId = platform, status/5-money/7-ship copied);
- one SubOrderItem per OrderItem (snapshot fields + `sellerName='Platform'`);
- **idempotency:** second run creates nothing (skip-if-exists);
- aborts if Platform Seller missing;
- validation asserts pass on correct data, throw on a broken fixture.

**No new service/controller tests** — S1 changes no request-path behavior. The existing order + inventory suites must stay green (regression proof).

## Verification gate (RULE.md §5)

1. `prisma migrate diff` shows expected additive DDL (no drops/data-loss); `prisma generate` OK; `tsc --noEmit` 0 new errors (3 known pre-existing M2/M3 spec errors unchanged).
2. `npm test` (API) — full suite green (unchanged behavior + new backfill tests).
3. **Live vs `ecom_dev`:** apply via `migrate deploy` (confirm additive, sibling migrations intact, **DB not reset**); run `backfill-suborders.ts`; confirm 3 validation asserts pass on real data; **re-run** to prove idempotency (0 new rows); boot the API and spot-check existing order endpoints (`GET /orders`, place, status update) behave exactly as before (no SubOrder read path exists yet).

## Out of scope (YAGNI — S1)

placeOrder seller-grouping + per-seller totals (S2); state machine on SubOrder + `rollupOrderStatus` + `suborder.status.changed` (S3); inventory movements writing `subOrderId` (S2/S3); seller suborder API + admin/storefront read paths + UI (S3/S4); dropping `OrderItem` (Wave C4); `Shipment`/`ReturnRequest`/`SellerPayout` relations on SubOrder (M5c/M6).

## Risks

- **Shared-`ecom_dev` migration drift** → file-diff + `migrate deploy`, never reset (memory `shared-ecom-dev-cross-branch-drift`, `prisma-migrate-needs-explicit-db-user`).
- **Backfill non-idempotency / partial run** → skip-if-`subOrders:none` + per-order transaction + re-run proof.
- **Silent data loss in backfill** → explicit count + totals-parity asserts, non-zero exit on mismatch.
- **Accidental behavior change** → S1 touches no request path; existing suites green is the guard; deferred relations keep the schema compiling without pulling in M5c/M6 tables.
