# WORKTREE_EXECUTION_PLAN.md — Branch Execution & Merge Strategy

> **Status:** Architecture document. The execution strategy for delivering the marketplace evolution across git worktrees/branches. **No code is implemented from this file.** It validates the worktree approach proposed in `PARALLEL_EXECUTION_PLAN.md` and gives each feature branch a merge contract.
>
> **Derived from:** `IMPLEMENTATION_PLAN.md` (phases M0–M7), `PARALLEL_EXECUTION_PLAN.md` (parallel waves), `DOMAIN_MODEL.md §6` (event catalog), `MIGRATION_PLAN.md` (schema ordering), `ARCHITECTURE_DECISIONS.md` (ADR-002/003/009/015).
> **Date:** 2026-06-19

---

## 1. Worktree Strategy Validation

### 1.1 Verdict

**The proposed worktree strategy is VALID, with three guardrails.** The monorepo (`apps/api`, `apps/storefront`, `apps/admin` in one git repo) makes worktrees the right isolation tool — each branch gets its own working tree so parallel phases never fight over files. The strategy holds *because* the architecture was designed for it: bounded contexts own disjoint tables (ADR-002), provider interfaces decouple external concerns (ADR-009), and the event bus decouples cross-context side-effects (ADR-003). What makes it *safe* rather than chaotic is respecting the constraints below.

### 1.2 What's sound

- **Bounded-context table ownership** means most parallel branches edit disjoint Prisma models — the dominant source of merge pain is avoided by construction. `feat/payments` (Payment/Transaction/Refund), `feat/logistics` (Shipment/ShippingRate), `feat/reviews` (Review), `feat/promotions` (Coupon) touch non-overlapping tables.
- **Provider interfaces** (ADR-009) mean `feat/search-v2`, `feat/payments`, `feat/logistics`, `feat/notifications` each add a new module + interface impl without editing each other's code.
- **Event bus** (ADR-003) means a consumer branch (`feat/notifications`, `feat/analytics`) subscribes to events without the producer branch changing — they integrate through the event contract, not shared code.
- **The serial spine is correctly identified**: M1 → M2 → M5a are non-parallel gates, and the plan does not try to parallelize them.

### 1.3 The three guardrails (must hold for the strategy to work)

1. **One shared schema, globally-ordered migrations.** All three apps share one Postgres DB and one `schema.prisma`. Two branches that both edit `schema.prisma` or run `prisma migrate` against the same dev DB **will collide** — on the file *and* on migration history. Mitigation: each branch owns a disjoint set of models; migrations are applied in the dependency order of `MIGRATION_PLAN.md`; rebase a branch onto latest `main` (with migrations applied) before it adds its own migration. `schema.prisma` is the single highest-conflict file in the repo — treat any concurrent edit to it as a coordination event.

2. **Integration choke points are serialized, not parallel.** Two files/flows are touched by multiple phases and are *not* table-disjoint:
   - **The totals pipeline** (`cart/totals.ts`, `cart/cart-pricing.ts`) — touched by M5a (per-seller restructure), M5c (shipping into per-seller `shippingTotal`), M6b (coupons into `discountTotal`). M5a must define the shape first (barrier); M5c/M6b integrate after.
   - **The checkout flow / `placeOrder`** — touched by M5a (split), M5b (payment step), M5c (shipping step). M5a is the barrier; M5b and M5c's *checkout-UI* merges must be sequenced even though their backend modules are independent.

3. **The M5a barrier is real.** `feat/order-split` restructures `Order`/`placeOrder` and the order topology that payments/logistics/returns/coupons/payouts all attach to. Nothing in M5b/M5c/M6 should branch from a pre-M5a `main`. Branch them from `main` *after* M5a merges.

### 1.4 Worktree hygiene (operational)

- One worktree per active branch; name = branch name (table below). Use the repo's `worktree-manager` skill for create/list/remove.
- A branch that has been idle while `main` advanced (especially across a schema change) **must rebase before merge** — particularly any branch crossing the M2 SKU migration or the M5a order restructure.
- Per RULE.md §3: commit locally when asked; **never push without explicit permission**; the user merges PRs (memory `workflow-merge-then-resume`) — so "merge order" below is the order in which the user should land PRs, and branches should be kept rebased so each PR is a clean fast-forward-ish merge.
- Per RULE.md §1: "one slice at a time, stop and verify" applies *within* a branch; worktrees parallelize *across* branches only.

---

## 2. Per-Branch Merge Contract

Legend — **Merge Independently:** can this branch merge to `main` on its own without dragging in another unmerged branch? **Merge Conflict Risk:** likelihood of textual/semantic conflict at merge, given the files it touches vs. concurrent branches. **Merge Order:** the global sequence number the user should land PRs in (branches sharing a number may land in any order relative to each other).

### Spine (serial — must land in order)

#### `feat/marketplace-foundation` (M1)
- **Depends On:** M0 baseline (`main`).
- **Produces Events:** `seller.registered`, `seller.kyc.approved`, `seller.kyc.rejected`. *(Also establishes the event-emit conventions + `AuditService`.)*
- **Consumes Events:** `seller.*` → Notifications stub; activates audit consumption in existing order/inventory mutations (in-line, not event-driven).
- **Can Merge Independently:** YES (root).
- **Merge Order:** **1**.
- **Merge Conflict Risk:** **MEDIUM** — edits shared infra (`auth`, `app.module.ts`, `main.ts`, `Role` enum). Low risk *because* it's first and alone; but it changes global guard/throttler/CORS wiring that later branches build on, so it must land before anything else branches off it.

#### `feat/seller-system` (M2)
- **Depends On:** `feat/marketplace-foundation` (M1).
- **Produces Events:** `product.created`, `product.updated`.
- **Consumes Events:** `inventory.low-stock` (extends listener to target the owning seller).
- **Can Merge Independently:** YES (after M1).
- **Merge Order:** **2**.
- **Merge Conflict Risk:** **HIGH** — owns the only breaking migration (B1–B5: `Product.sellerId` + `sku` composite-unique) and edits `Product`/`InventoryItem` in `schema.prisma` plus every `findUnique({sku})` call site. Anything else editing those models concurrently conflicts. Mitigation: land it alone in wave W2 (only `feat/notifications`, which is schema-disjoint, runs alongside); ship the SKU break with its call-site fixes in one PR (`MIGRATION_PLAN §2.2`).

#### `feat/order-split` (M5a) — keystone barrier
- **Depends On:** `feat/seller-system` (M2).
- **Produces Events:** `order.placed`, `suborder.status.changed`.
- **Consumes Events:** none external (drives inventory release/deduct/restock in-transaction).
- **Can Merge Independently:** YES (after M2).
- **Merge Order:** **4** (after the W3 fan-out branches; see ordering note).
- **Merge Conflict Risk:** **HIGH** — restructures `Order`/`OrderItem`/`placeOrder`/`updateStatus`, adds `SubOrder`/`SubOrderItem`, touches the totals integration and the order-detail UIs on both frontends. It is a barrier precisely because so much attaches to it. Mitigation: no M5b/M5c/M6 branch exists until this merges; rebase any in-flight W3 branch that touches order/totals reads after this lands.

### Catalog/Inventory/Search fan-out (parallel — W3)

#### `feat/catalog-v2` (M3a)
- **Depends On:** `feat/seller-system` (M2).
- **Produces Events:** none.
- **Consumes Events:** `product.*` (for future cache busting; no behavior yet).
- **Can Merge Independently:** YES.
- **Merge Order:** **3**.
- **Merge Conflict Risk:** **MEDIUM** — adds `Product.ratingAvg/ratingCount` columns (F2) to `schema.prisma`, which `feat/reviews` also references. Coordinate F2 ownership: catalog-v2 *adds* the columns, reviews *populates* them. Otherwise touches storefront read code (disjoint).

#### `feat/inventory-v2` (M3b)
- **Depends On:** `feat/seller-system` (M2).
- **Produces Events:** none.
- **Consumes Events:** `inventory.low-stock` (already wired).
- **Can Merge Independently:** YES.
- **Merge Order:** **3**.
- **Merge Conflict Risk:** **LOW** — seller-scoped *report queries* over the existing ledger; no schema beyond M2's `InventoryItem.sellerId`. Disjoint from catalog/search code.

#### `feat/search-v2` (M3c)
- **Depends On:** `feat/seller-system` (M2).
- **Produces Events:** none.
- **Consumes Events:** `product.created`, `product.updated` (index-sync seam).
- **Can Merge Independently:** YES.
- **Merge Order:** **3**.
- **Merge Conflict Risk:** **LOW** — new `search` module behind `ProductSearch` + a GIN index (K2, own migration). Touches `products.service` query path lightly; coordinate with catalog-v2 only if both edit `buildWhere`.

### Reviews + Notifications (parallel — can overlap W2/W3)

#### `feat/reviews` (M4a)
- **Depends On:** `feat/seller-system` (M2) hard; `feat/order-split` (M5a) soft (for the verified-purchase tightening).
- **Produces Events:** `review.published`.
- **Consumes Events:** `review.published` → rating aggregate + `NEW_REVIEW` notification.
- **Can Merge Independently:** YES — ships gated on legacy `DELIVERED` orders first; tightens to `SubOrder` after M5a (a follow-up slice, not a merge blocker).
- **Merge Order:** **3** (initial) / re-touch after **4** for the verified-purchase tightening.
- **Merge Conflict Risk:** **MEDIUM** — references `Product.ratingAvg/ratingCount` (shared with `feat/catalog-v2`, F2). Land catalog-v2's column-add first or coordinate the F2 migration. New `Review` table is disjoint.

#### `feat/notifications` (M4b)
- **Depends On:** `feat/marketplace-foundation` (M1).
- **Produces Events:** none (pure consumer).
- **Consumes Events:** all notification-bearing events (`DOMAIN_MODEL §6`) — gains more as producers land; no producer code changes.
- **Can Merge Independently:** YES (after M1).
- **Merge Order:** **3** (can land as early as alongside M2).
- **Merge Conflict Risk:** **LOW** — `notifications` module + `Notification` table + `NotificationChannel` provider + `NotificationType` enum values (K1, own migration). Only shared touch is adding enum values; isolate in its own migration.

### Payments + Logistics (parallel — W5, after M5a)

#### `feat/payments` (M5b)
- **Depends On:** `feat/order-split` (M5a).
- **Produces Events:** `payment.captured`, `payment.failed`.
- **Consumes Events:** `order.placed` (create intent).
- **Can Merge Independently:** YES (after M5a).
- **Merge Order:** **5**.
- **Merge Conflict Risk:** **MEDIUM** — new `payments` module + tables are disjoint (LOW there), but it edits the **checkout flow** (payment step) shared with `feat/logistics`. Sequence the two checkout-UI merges. Webhook/idempotency code is self-contained.

#### `feat/logistics` (M5c)
- **Depends On:** `feat/order-split` (M5a).
- **Produces Events:** `shipment.event`.
- **Consumes Events:** `suborder.status.changed` (SHIPPED → create shipment).
- **Can Merge Independently:** YES (after M5a).
- **Merge Order:** **5**.
- **Merge Conflict Risk:** **MEDIUM** — disjoint tables (LOW), but edits the **checkout flow** (shipping step) and the **totals pipeline** (per-seller `shippingTotal`), both shared. Coordinate with `feat/payments` (checkout) and `feat/promotions` (totals). Land after one of them and rebase, or split the checkout-UI touch into a small sequenced merge.

### Returns + Coupons + Payouts (parallel — W6)

#### `feat/returns` (M6a)
- **Depends On:** `feat/order-split` (M5a) + `feat/payments` (M5b).
- **Produces Events:** `return.requested`, `return.approved`.
- **Consumes Events:** drives restock (existing primitive) + refund-against-payment.
- **Can Merge Independently:** YES (after M5a+M5b).
- **Merge Order:** **6**.
- **Merge Conflict Risk:** **LOW** — new `returns` module + `ReturnRequest` table; links `Refund.returnRequestId` (a column on a Payments-owned table — coordinate the one-line relation add with whatever last touched `Refund`). Otherwise disjoint from coupons/payouts.

#### `feat/promotions` (M6b)
- **Depends On:** `feat/order-split` (M5a).
- **Produces Events:** `coupon.applied`.
- **Consumes Events:** none.
- **Can Merge Independently:** YES (after M5a).
- **Merge Order:** **6**.
- **Merge Conflict Risk:** **MEDIUM** — disjoint tables (Coupon/CouponUsage), but integrates with the **totals pipeline** (`discountTotal`), shared with `feat/logistics` (shipping). Both feed per-seller totals defined by M5a; sequence the pipeline-integration touch with logistics.

#### `feat/payouts` (M6c)
- **Depends On:** `feat/order-split` (M5a) + `feat/payments` (M5b).
- **Produces Events:** `payout.initiated`, `payout.completed`.
- **Consumes Events:** `suborder.status.changed` (DELIVERED), `payment.captured`.
- **Can Merge Independently:** YES (after M5a+M5b).
- **Merge Order:** **6**.
- **Merge Conflict Risk:** **LOW** — new `payouts` module + `SellerPayout` table; pure event consumer. Disjoint from returns/coupons.

### Analytics + Customers + CMS/Support (parallel — W7)

#### `feat/analytics` (M7a)
- **Depends On:** M5 (order/payment data to aggregate).
- **Produces Events:** none.
- **Consumes Events:** `order.placed`, `suborder.status.changed` (incremental matview refresh trigger).
- **Can Merge Independently:** YES.
- **Merge Order:** **7**.
- **Merge Conflict Risk:** **LOW** — fills the empty `analytics` stub; read-only matviews (own raw-SQL migrations); no transactional tables.

#### `feat/customers` (M7b)
- **Depends On:** M5 (order/spend data).
- **Produces Events:** none.
- **Consumes Events:** none.
- **Can Merge Independently:** YES.
- **Merge Order:** **7**.
- **Merge Conflict Risk:** **LOW** — fills the empty `customers` stub; admin read endpoints over existing relations; no schema.

#### `feat/cms-support` (M7c)
- **Depends On:** `feat/marketplace-foundation` (M1) — can start early.
- **Produces Events:** none (support may emit ticket events later).
- **Consumes Events:** none.
- **Can Merge Independently:** YES (after M1).
- **Merge Order:** **7** (could land as early as **3** since schema-disjoint).
- **Merge Conflict Risk:** **LOW** — new `cms`/`support` modules + disjoint tables (`ContentPage`, `SupportTicket`, `TicketMessage`).

### Cross-cutting (last)

#### `feat/nfr-hardening` (M7d)
- **Depends On:** spans all; finalize after M6 (some pieces — throttler/helmet/CORS — already in M1).
- **Produces Events:** none.
- **Consumes Events:** none (adds cache busting on `product.*`).
- **Can Merge Independently:** YES, but **should land last**.
- **Merge Order:** **8**.
- **Merge Conflict Risk:** **HIGH** — touches `main.ts`, global interceptors/filters, admin auth plumbing (httpOnly cookie migration, ADR-017), and accessibility across both frontends. It collides with anything in flight. Mitigation: land after feature branches settle; if split, land the global-config pieces and the admin-auth migration as separate sequenced PRs.

---

## 3. Merge Order Summary

| Order | Branch(es) | Independent? | Conflict Risk | Note |
|---|---|---|---|---|
| 1 | `feat/marketplace-foundation` | YES | MEDIUM | Root; shared infra. |
| 2 | `feat/seller-system` | YES (after 1) | HIGH | Breaking SKU migration; land alone. |
| 3 | `feat/catalog-v2`, `feat/inventory-v2`, `feat/search-v2`, `feat/reviews`, `feat/notifications`, *(opt) `feat/cms-support`* | YES (after their dep) | LOW–MED | Parallel fan-out; coordinate F2 between catalog-v2 ↔ reviews. |
| 4 | `feat/order-split` | YES (after 2) | HIGH | Keystone barrier; rebase order/totals-touching branches after. |
| 5 | `feat/payments`, `feat/logistics` | YES (after 4) | MEDIUM | Sequence the two checkout-UI merges. |
| 6 | `feat/returns`, `feat/promotions`, `feat/payouts` | YES (after deps) | LOW–MED | promotions/logistics share the totals pipeline. |
| 7 | `feat/analytics`, `feat/customers`, `feat/cms-support` | YES (after M5) | LOW | Read-mostly; stubs filled. |
| 8 | `feat/nfr-hardening` | YES (land last) | HIGH | Cross-cutting; collides with in-flight work. |

**Ordering note on 3 vs 4:** The W3 fan-out (order 3) and `feat/order-split` (order 4) both branch off post-M2 `main` and can develop concurrently. Merge the schema-light W3 branches *before* `feat/order-split` so the heavy order restructure rebases onto a stable base, not the other way around. `feat/reviews` then takes a small follow-up slice after order-split to tighten its verified-purchase check.

---

## 4. Highest-Risk Merge Interactions (watch list)

| Interaction | Why it's risky | Mitigation |
|---|---|---|
| `feat/seller-system` × any catalog/inventory branch | Both edit `Product`/`InventoryItem` + the breaking SKU migration | Land seller-system alone (W2); no other Product/Inventory-editing branch in flight. |
| `feat/order-split` × W3 leftovers | Order restructure vs. order-detail reads | Merge W3 first; rebase any order-touching branch after order-split. |
| `feat/payments` × `feat/logistics` | Both edit the checkout flow | Sequence the two checkout-UI merges (small, deliberate). |
| `feat/logistics` × `feat/promotions` | Both edit the totals pipeline (`shippingTotal` / `discountTotal`) | M5a fixes the pipeline shape; integrate one, rebase the other. |
| `feat/catalog-v2` × `feat/reviews` | Both reference `Product.ratingAvg/ratingCount` (F2) | catalog-v2 adds the columns; reviews populates; land catalog-v2's migration first. |
| `feat/returns` × `feat/payments` | returns adds `Refund.returnRequestId` to a Payments-owned table | Coordinate the one relation-column add; rebase returns onto merged payments. |
| `feat/nfr-hardening` × everything | Global config + admin auth + a11y | Land last; split into config / admin-auth / a11y PRs if needed. |
| **`schema.prisma`** (any two concurrent editors) | Single highest-conflict file; migration-history collisions | Disjoint model ownership per branch; rebase before adding a migration; treat concurrent edits as a coordination event. |

---

## 5. Standing Rules

1. **Branch off post-dependency `main`.** Never branch an M5b/M5c/M6 feature from a pre-M5a base. Never branch a catalog/inventory feature from a pre-M2 base.
2. **Rebase before merge** any branch idle across a schema change (M2 SKU, M5a order restructure).
3. **One migration concern per branch**, applied in `MIGRATION_PLAN.md` order; enum/`CONCURRENTLY` changes isolated and non-transactional.
4. **No push without explicit permission** (RULE.md §3); the user lands PRs in the Merge Order above; keep branches rebased so each PR is a clean merge.
5. **One slice at a time within a branch** (RULE.md §1); worktrees parallelize across branches only — never to bypass the M1 → M2 → M5a serial spine or stop-and-verify.
6. **Do not start implementation from this file.** It is the execution strategy only.
