# MIGRATION_PLAN.md — Schema & Data Migration Strategy

> **Status:** Architecture document. The safe, ordered path to evolve the live Postgres schema (`apps/api/prisma/schema.prisma`) from single-vendor to marketplace. Pairs with `DOMAIN_MODEL.md` (target shapes) and `ARCHITECTURE_DECISIONS.md` (ADR-007, ADR-015).
>
> **Principle (ADR-015):** every migration is **expand → backfill → contract**, additive and backward-compatible. The running app must never break between deploys. The one intentional breaking change (ADR-007) is contained and sequenced.
> **Date:** 2026-06-19

---

## 0. Ground Rules

1. **Expand/contract.** Add nullable columns/tables first (expand). Deploy code that writes them. Backfill existing rows. Only later, in a *separate* migration, tighten constraints or drop deprecated columns (contract).
2. **One migration = one concern.** Especially: PostgreSQL **`ALTER TYPE … ADD VALUE` cannot run inside a transaction**, and Prisma wraps migrations in a transaction by default → every enum extension is its **own** migration file.
3. **Data migrations are scripts, not schema migrations.** Backfills (`UPDATE …`) run as one-time idempotent scripts (extend `prisma/seed.ts` or a `prisma/migrations-data/*.ts` runner), not inside the DDL migration file.
4. **Large-table indexes use `CREATE INDEX CONCURRENTLY`** in raw SQL (Prisma doesn't emit it). Concurrent index creation can't run in a transaction either → its own migration.
5. **Every new FK gets an `@@index`** (existing discipline). Every new monetary column is `Decimal(12,2)`. Every new PK is `cuid()`.
6. **Each step is independently deployable and reversible.** Reverse = drop the added column/table (no data loss for additive steps; backfilled data is reconstructable from source tables until contract).
7. **Smoke-verify against `ecom_dev`** after each step (RULE.md §5): app boots, existing endpoints still pass, new columns populate.

---

## 1. Migration Wave Overview

Waves group migrations by the feature spine. Within a wave, steps are ordered; across waves, see `PARALLEL_EXECUTION_PLAN.md` for what can interleave. "Breaking?" = does it require coordinated code change to avoid runtime/compile failure.

| # | Migration | Type | Breaking? | Depends on |
|---|---|---|---|---|
| **Wave A — Seller identity** |
| A1 | `ALTER TYPE "Role" ADD VALUE 'SELLER'` | enum (own, non-txn) | No | — |
| A2 | Create `Seller` table (+ indexes) | additive | No | A1 |
| A3 | Seed **Platform Seller** (linked to admin user) | data script | No | A2 |
| **Wave B — Product & inventory ownership** |
| B1 | `Product.sellerId TEXT NULL` (+ `@@index`) | additive | No | A2 |
| B2 | `InventoryItem.sellerId TEXT NULL` (+ `@@index`) | additive | No | A2 |
| B3 | Backfill `sellerId` = Platform Seller on existing rows | data script | No (operational) | A3,B1,B2 |
| B4 | `Product.sellerId`/`InventoryItem.sellerId` → NOT NULL + FK | contract | Requires B3 | B3 |
| B5 | Drop `Product_sku_key`; add `@@unique([sku, sellerId])` | **breaking (intentional)** | **Yes** | B4 |
| **Wave C — Order split (Fulfillment)** |
| C1 | Create `SubOrder`, `SubOrderItem` (+ indexes) | additive | No | A2,B4 |
| C2 | `InventoryMovement.subOrderId TEXT NULL` (+ `@@index`) | additive | No | C1 |
| C3 | Backfill: 1 `SubOrder`(+items) per existing `Order` → Platform Seller | data script | No (operational) | C1 |
| C4 | (later) deprecate then drop `OrderItem` | contract | Yes (after read paths move) | C3 + code |
| **Wave D — Payments** |
| D1 | Create `Payment`, `Transaction`, `Refund` (+ indexes) | additive | No | — (logically after C) |
| **Wave E — Returns** |
| E1 | Create `ReturnRequest` (+ indexes); link `Refund.returnRequestId` | additive | No | C1,D1 |
| **Wave F — Reviews** |
| F1 | Create `Review` (+ indexes); add `CHECK (rating 1..5)` raw SQL | additive | No | B4 |
| F2 | `Product.ratingAvg Decimal(3,2) NULL`, `ratingCount Int default 0` | additive | No | — |
| **Wave G — Coupons** |
| G1 | Create `Coupon`, `CouponUsage` (+ indexes); `Order.couponId TEXT NULL` | additive | No | — |
| **Wave H — Logistics** |
| H1 | Create `ShippingRate`, `Shipment`, `ShipmentEvent` (+ indexes) | additive | No | C1 |
| **Wave I — Payouts** |
| I1 | Create `SellerPayout` (+ indexes, `@@unique([subOrderId])`) | additive | No | C1,D1 |
| **Wave J — Platform** |
| J1 | Create `ContentPage` (CMS) | additive | No | — |
| J2 | Create `SupportTicket`, `TicketMessage` (+ indexes) | additive | No | — |
| J3 | `User.mfaEnabled Bool default false`, `mfaSecret String? NULL` | additive | No | — |
| **Wave K — Notifications & Search** |
| K1 | `ALTER TYPE "NotificationType" ADD VALUE …` (each value, own non-txn migration) | enum | No | — |
| K2 | GIN FTS index on `Product` via raw SQL `CONCURRENTLY` | additive (own) | No | B4 |

Critical path: **A → B → C → D**. Waves E–K are additive and largely parallel once their dependency (mostly C and/or D) exists.

---

## 2. The Three Risky Migrations (detailed)

### 2.1 Wave A1 / K1 — Enum `ADD VALUE` (Role, NotificationType)

**Risk.** Prisma wraps migrations in a transaction; `ALTER TYPE … ADD VALUE` errors inside one.

**Procedure.**
1. Generate the migration for *only* the enum change (`prisma migrate dev --create-only`).
2. Confirm the SQL is a bare `ALTER TYPE "Role" ADD VALUE 'SELLER';` with **no other statements**.
3. Add the no-transaction marker so Prisma runs it outside a txn (Prisma respects a dedicated migration; keep one `ADD VALUE` per file). For multiple `NotificationType` values, one file per value (or rely on Postgres 12+ which allows multiple `ADD VALUE` outside a txn — still keep them isolated from other DDL).
4. Apply; verify `SELECT enum_range(NULL::"Role")`.

**Reverse.** Postgres can't drop an enum value cleanly; treat enum additions as forward-only. (No rows use `SELLER` until Wave A2+ code ships, so an unused value is harmless.)

### 2.2 Wave B (B1→B5) — `Product.sellerId` + SKU constraint (the one breaking change, ADR-007)

This is the only place a compile/runtime break is required. Sequenced so the break is *contained and intentional*.

```
B1  ALTER TABLE "Product" ADD COLUMN "sellerId" TEXT;            -- nullable, no FK
    CREATE INDEX "Product_sellerId_idx" ON "Product"("sellerId");
B2  ALTER TABLE "InventoryItem" ADD COLUMN "sellerId" TEXT;
    CREATE INDEX "InventoryItem_sellerId_idx" ON "InventoryItem"("sellerId");
--- deploy code that sets sellerId on every new product/inventory write ---
B3  (data script, idempotent)
    -- platform seller already exists from A3
    UPDATE "Product"       SET "sellerId" = $platform WHERE "sellerId" IS NULL;
    UPDATE "InventoryItem" SET "sellerId" = $platform WHERE "sellerId" IS NULL;
B4  ALTER TABLE "Product"       ALTER COLUMN "sellerId" SET NOT NULL;
    ALTER TABLE "Product"       ADD CONSTRAINT "Product_sellerId_fkey"
        FOREIGN KEY ("sellerId") REFERENCES "Seller"("id");
    (same for InventoryItem)
B5  DROP INDEX "Product_sku_key";                                -- was UNIQUE(sku)
    CREATE UNIQUE INDEX "Product_sku_sellerId_key" ON "Product"("sku","sellerId");
```

**Why this order.** Adding NOT NULL before backfill (B3) fails — existing rows have no `sellerId`. Adding the composite unique before `sellerId` is NOT NULL (B4) would permit duplicate `(sku, NULL)` rows, defeating the constraint.

**The intentional break (B5).** After B5, Prisma's generated client **removes `sku` from `Product`'s `findUnique` where-type**. Any `prisma.product.findUnique({ where: { sku } })` becomes a TypeScript compile error — a *forcing function* surfacing every call site. Fix each to `findFirst({ where: { sku, sellerId } })`. **Ship B5 in the same PR as the call-site fixes** so `main` never has a broken build. Audit call sites before B5: `grep -rn "findUnique" apps/api/src` and product create/update dup-SKU handling (`products.service.ts` maps P2002→409).

**Reverse.** Re-add `UNIQUE(sku)` (safe only if no two sellers share a SKU yet) and set `sellerId` nullable. Practically forward-only once sellers list overlapping SKUs.

### 2.3 Wave C (C1→C3) — Order → SubOrder backfill (ADR-006)

```
C1  CREATE TABLE "SubOrder" (... orderId NOT NULL FK, sellerId NOT NULL FK,
        status, 5×Decimal(12,2) totals, 7× ship* snapshot, timestamps);
    CREATE TABLE "SubOrderItem" (... subOrderId NOT NULL FK, productId FK,
        productName, unitPrice, quantity, lineTotal, sellerName);
    + indexes: SubOrder[orderId], [sellerId,status,createdAt], [status];
              SubOrderItem[subOrderId],[productId]
C2  ALTER TABLE "InventoryMovement" ADD COLUMN "subOrderId" TEXT;  -- nullable
    CREATE INDEX "InventoryMovement_subOrderId_idx" ...
C3  (data script, idempotent, run with API paused or in a low-traffic window)
    for each Order o:
      create one SubOrder s (sellerId = Platform Seller, status = o.status,
        copy o.subtotal/discount/tax/shipping/grandTotal, copy o.ship* fields)
      for each OrderItem oi of o:
        create SubOrderItem (subOrderId=s.id, copy productId/productName/
          unitPrice/quantity/lineTotal, sellerName = 'Platform')
```

**Why `OrderItem` is kept.** `OrderItem` is **not dropped** in Wave C. It remains the historical source until all read paths (storefront order detail, admin order detail, analytics) move to `SubOrder`/`SubOrderItem`. Drop is Wave C4, a later contract migration.

**`Order.status` becomes a rollup.** No schema change — the column stays. Code change: `updateStatus` now transitions `SubOrder.status` and recomputes `Order.status` (`rollupOrderStatus`) in the **same `$transaction`**. Existing single-seller orders (one SubOrder) roll up to the same status they had, so behavior is unchanged for legacy data.

**Validation.** After C3: assert `count(OrderItem) == count(SubOrderItem)` and `count(Order) == count(distinct SubOrder.orderId)`; spot-check totals parity (`Order.grandTotal == sum(SubOrder.grandTotal)`).

**Reverse.** Drop `SubOrder`/`SubOrderItem` (additive tables; `OrderItem` still intact, so no data loss).

---

## 3. Backfill / Data Scripts

Run via an idempotent script (`prisma/seed.ts` extension or a dedicated runner), not in DDL files.

| Script | What | Idempotency | When |
|---|---|---|---|
| `seedPlatformSeller` | Upsert one `Seller{slug:'platform', status:ACTIVE}` linked to `admin@example.com` | upsert on `userId` | A3 (and re-run safe) |
| `backfillProductSeller` | `UPDATE … WHERE sellerId IS NULL` | guarded by `IS NULL` | B3 |
| `backfillSubOrders` | One SubOrder(+items) per Order | skip Orders that already have a SubOrder | C3 |
| `backfillRatingAggregates` | Recompute `Product.ratingAvg/Count` from `Review` | recompute (overwrites) | after F1, when reviews exist |

**Operational window.** B3 and C3 mutate existing rows. For a demo/dev DB they run instantly with the API paused. For a production-scale dataset: run in batches (`LIMIT`/cursor), off-peak, and prefer running while the new columns are nullable (writes from live traffic also populate them, so the backfill only fills the historical tail).

---

## 4. Indexing Migrations (scalability, PRD requirement)

All new tables carry FK + sort indexes at creation (see `DOMAIN_MODEL.md`). Two need special handling:

- **K2 — Product FTS (GIN).** Not expressible in `schema.prisma`. Add as raw SQL in its own migration:
  ```sql
  CREATE INDEX CONCURRENTLY "Product_fts_idx" ON "Product"
    USING GIN (to_tsvector('english', "name" || ' ' || "description"));
  ```
  `CONCURRENTLY` ⇒ no write lock, but **cannot run in a transaction** ⇒ isolated migration.
- **Composite seller-dashboard index.** `SubOrder(sellerId, status, createdAt)` created with C1 — covers the seller fulfillment-queue query (`WHERE sellerId=$1 AND status=ANY($2) ORDER BY createdAt DESC`) and the broader `(sellerId, createdAt)` sort.

**Pagination.** New high-growth list endpoints (`SubOrder`, `SellerPayout`, `Review`) should use keyset/cursor pagination (`WHERE createdAt < $cursor ORDER BY createdAt DESC LIMIT N`) backed by these composite indexes, not `OFFSET`. (The existing `{page,pageSize,total}` offset shape is fine for smaller admin lists; switch the large seller-facing lists to cursor.)

---

## 5. Migration ↔ Phase Mapping

Which implementation phase (`IMPLEMENTATION_PLAN.md`) ships which migrations:

| Phase (M-series) | Migrations |
|---|---|
| M1 Marketplace Foundation | A1, A2, A3, J3 (MFA cols), security hardening (no schema) |
| M2 Seller System | B1, B2, B3, B4, B5 |
| M3 Catalog V2 | F2 (rating cols), K2 (FTS) |
| M3 Search | (uses K2) |
| M3 Inventory V2 | (uses B2/B4; ledger code only) |
| M4 Reviews | F1 |
| M4 Notifications | K1 |
| M5 Order Split (Fulfillment) | C1, C2, C3 |
| M5 Payments | D1 |
| M5 Logistics | H1 |
| M6 Returns | E1 |
| M6 Coupons/Promotions | G1 |
| M6 Payouts | I1 |
| M7 Analytics | matviews (own raw-SQL migrations) |
| M7 Platform/CMS/Support | J1, J2 |
| Late contract | C4 (drop `OrderItem`) |

---

## 6. Rollback Strategy

| Migration class | Rollback |
|---|---|
| Additive table | `DROP TABLE` — no data loss (nothing else depends until code uses it). |
| Additive nullable column | `DROP COLUMN` — safe pre-contract. |
| Enum `ADD VALUE` | Forward-only; unused values are harmless. Don't ship code using the value until the migration is applied everywhere. |
| Backfill script | Re-runnable; reverse = `SET col = NULL` (data reconstructable from source while source table exists). |
| **B4 NOT NULL+FK** | Drop FK + set nullable. Reversible while `sellerId` data is reconstructable from the platform-seller default. |
| **B5 SKU composite unique** | Re-add `UNIQUE(sku)` — only safe before any two sellers share a SKU. Treat as forward-only once overlapping SKUs exist; this is why B5 ships with its call-site fixes and is the deliberate point-of-no-return. |
| **C contract (drop OrderItem)** | Forward-only; do not drop until `SubOrderItem` has fully replaced reads (kept as a separate late migration precisely so it's the last, most-considered step). |

**General rule:** anything before a *contract* step is cleanly reversible. The two forward-only points (B5, C4) are explicitly isolated, late, and paired with the code that makes them safe.

---

## 7. Pre-flight Checklist (run before each schema PR)

- [ ] Migration is **one concern**; enum/`CONCURRENTLY` changes isolated and non-transactional.
- [ ] New columns nullable-first; NOT NULL/FK only after a backfill step exists.
- [ ] Every new FK has an `@@index`; every money column is `Decimal(12,2)`; PKs `cuid()`.
- [ ] No raw card fields anywhere (ADR-013).
- [ ] `npx prisma generate` clean; `npm run build` clean (catch the intentional B5 break in its own PR).
- [ ] App boots against `ecom_dev`; existing endpoints still green; new columns populate on writes.
- [ ] Backfill script idempotent and validated (row-count assertions for B3/C3).
- [ ] Rollback path written down in the PR description.
