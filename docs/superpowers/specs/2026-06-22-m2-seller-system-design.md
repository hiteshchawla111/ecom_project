# M2 — Seller System — Design

> **Date:** 2026-06-22
> **Phase:** M2 (`IMPLEMENTATION_PLAN.md`). Branch: `feat/seller-system`. Depends on M1 (✅ merged, PR #8).
> **Reads with:** `IMPLEMENTATION_PLAN.md §M2`, `MIGRATION_PLAN.md §2.2` (Wave B), `WORKTREE_EXECUTION_PLAN.md` (merge order 2), `ARCHITECTURE_DECISIONS.md` (ADR-005 DB-side status, ADR-007 SKU break, ADR-008 service-layer scoping).

## Objective

Make `Seller` a fully scoped tenant: sellers own their products and inventory with strict resource-level isolation, plus the seller-portal shell in the admin app. Establishes the ownership-scoping pattern every later seller feature reuses.

## Decisions locked in brainstorming

1. **Slice sequence: schema spine first.** The ownership migration (B1–B5) is slice 1; scoping, APIs, CSV, inventory, then UI follow.
2. **B1–B5 ship as one slice.** There are **no `prisma.product.findUnique({ where: { sku } })` call sites** in the API (`grep` confirmed), so the B5 break is *semantic* (contained in `products.service.ts`), not a compile error. Bundling the migration with its call-site fix satisfies `MIGRATION_PLAN §2.2` ("ship B5 with its call-site fixes in one PR").
3. **Seller identity resolved per request from `Seller.userId`** (not baked into the JWT). `SellerApprovedGuard` already does this lookup; extend it to attach `sellerId` to the request. Always fresh; consistent with ADR-005.
4. **Cross-tenant access → 404, not 403.** A seller must not be able to probe another seller's resource IDs. Realised via `findFirst({ where: { id, sellerId, deletedAt: null } })` → existing `NotFoundException` on miss.
5. **Product creation:** sellers create their own; the existing admin/platform create-path owns products as the **Platform Seller** (consistent with the B3 backfill). **No cross-seller authoring** by admin — deliberately not built (breaks the ownership/audit story; nothing in M2 acceptance needs it). Existing admin product form unchanged in M2.
6. **Seller portal = a scoped route group in `apps/admin`** (not a new app), reusing its tables/forms/pagination, role-scoped to SELLER.

## Slice plan (each a RULE.md §1 stop-and-verify point)

| # | Slice | Touches | Risk |
|---|-------|---------|------|
| 1 | **Ownership migration (B1→B5)** + dup-SKU fix | `schema.prisma`, `products.service`, backfill script | **HIGH** (breaking, forward-only) |
| 2 | **Service-layer ownership scoping** (`buildSellerScope`) for products + inventory | `products.service`, `inventory.service`, shared helper, `SellerApprovedGuard` | **HIGH** (the isolation guarantee) |
| 3 | **Seller product CRUD API** (scoped `GET/POST/PATCH /products`; "sold by" projection) | `products.controller`, DTOs, guards | MED |
| 4 | **CSV bulk import** (`POST /products/import`; size/row limits; per-row report) | new import service | MED |
| 5 | **Seller inventory API** (scoped stock/get/movements; low-stock notifies owning seller) | `inventory.controller/service`, notifications listener | MED |
| 6+ | **Admin seller-portal UI** (dashboard shell → products → inventory; "sold by" column) | `apps/admin` | MED (mechanical reuse) |

Slices 4–6 get finer planning when reached; this doc locks the phase shape and slice 1.

## Slice 1 — Ownership migration (detailed)

**Migration files, in order (expand → backfill → contract, `MIGRATION_PLAN §2.2`):**

1. `add_seller_ownership_nullable` (B1+B2) — `Product.sellerId TEXT NULL` + `@@index([sellerId])`; `InventoryItem.sellerId TEXT NULL` + `@@index([sellerId])`. Additive, no FK.
2. **Backfill (data script, B3)** — extend the seed/backfill runner: `UPDATE "Product" SET sellerId = $platform WHERE sellerId IS NULL`; same for `InventoryItem`. Idempotent (`IS NULL`-guarded). Platform Seller seeded in M1 (A3).
3. `seller_ownership_not_null_fk` (B4) — `sellerId` → NOT NULL + FK → `Seller(id)` on both tables.
4. `product_sku_composite_unique` (B5) — drop `Product_sku_key`; add `@@unique([sku, sellerId])`. Own migration (one concern: index swap). **Forward-only point-of-no-return.**

**Code shipped in the same slice (so `main` never has a broken build):**

- `schema.prisma`: `sellerId` relations on `Product`/`InventoryItem`; back-relations on `Seller`; `@unique` on `sku` → `@@unique([sku, sellerId])`.
- `products.service.create`: `sellerId = actor.role === SELLER ? actor.sellerId : PLATFORM_SELLER_ID`. (Actor wiring lands properly in slice 2; slice 1 may default to Platform Seller for the existing admin path.)
- `mapWriteError`: P2002 → 409 message unchanged ("A product with this SKU already exists"); now correctly scoped per seller under the composite key.

**Verification (TDD + RULE.md §5):**
- Red tests: same SKU + different sellers → OK; same SKU + same seller → 409.
- Migrate `ecom_dev`; assert `count(Product WHERE sellerId IS NULL) == 0` and same for `InventoryItem` after backfill.
- Boot API; HTTP-smoke create + dup-SKU (409) + bad-FK (400).

**Reversibility:** files 1–3 reversible (drop column / drop FK). File 4 (B5) is the documented forward-only break, bundled with its call-site fix.

## Ownership scoping pattern (slice 2, the core — ADR-008)

- **Resolution point: `SellerApprovedGuard`.** It already reads `Seller` by `userId` (selects `status`). Extend `select` to `{ id, status }`; for ACTIVE sellers attach `req.sellerId` (or extend the actor). ADMIN bypasses → `sellerId` undefined → unscoped.
- **`buildSellerScope(actor)` helper** (pure, unit-tested): `role === SELLER ? { sellerId } : {}`. Products + inventory services compose it into their existing `where` builders — one tested implementation, not re-derived per service.
- **404-on-miss:** seller-scoped reads use `findFirst({ where: { id, sellerId, deletedAt: null } })`; cross-tenant miss → existing `NotFoundException`. No new 403 path; isolation is invisible.
- Writes (create/update/adjust) force `sellerId`/scope to the actor's seller for `role === SELLER`.

## CSV import (slice 4)

`POST /products/import`, seller-scoped (rows always owned by the actor's seller). Guardrails (M2 risk note): max file size + max row count; per-row validation reusing `CreateProductDto` rules; **per-row result report** (created vs rejected-with-reason), not all-or-nothing. Per-seller SKU uniqueness → re-importing own SKU is the 409 case.

## Seller inventory (slice 5)

`GET /inventory`, `GET /inventory/:productId`, `POST /inventory/:productId/movements` — all via `buildSellerScope`; `getStockItem`/`adjust` use the `requireItem` pattern (404 cross-tenant). Extend the existing low-stock listener to also notify the **owning seller** (via `InventoryItem.sellerId`); the admin alert path is unchanged.

## Admin seller-portal UI (slices 6+)

Scoped route group in `apps/admin` for SELLER: dashboard shell → products (list/create/edit/CSV) → inventory (stock/adjust/movements), reusing existing tables/forms/pagination, role-scoped. Admin product views gain a "sold by" column.

## Acceptance criteria (from `IMPLEMENTATION_PLAN §M2`)

- Seller A creating a product owns it; Seller A cannot read/modify Seller B's product or inventory (→ 404); admin sees all.
- CSV upload creates multiple seller-scoped products.
- Existing admin-only product/inventory flows unchanged; existing M0/M1 tests green.
- All former `findUnique({ sku })` semantics migrated; build green.
- Cross-tenant isolation proven by tests; smoke-verified vs `ecom_dev` with two seller accounts.

## Events

- **Produced:** `product.created`, `product.updated` (feed future search index — M3c).
- **Consumed:** `inventory.low-stock` extended to target the owning seller.

## Risks

- **Cross-tenant leak** if any seller-reachable query misses the scope → enforced in service layer + isolation tests + review (ADR-008).
- **The B5 break** → sequenced + same-slice call-site fix; forward-only and isolated.
- **CSV abuse** (huge files) → size/row limits + per-row validation.

## Out of scope (M2)

Order split (M5a) — sellers can't yet receive split orders. Admin cross-seller product authoring. Seller-picker UI for admin. Search/facets (M3c). Reviews/ratings (M4a).
