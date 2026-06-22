# IMPLEMENTATION_PLAN.md — Marketplace Roadmap

> **Status:** Architecture document. The phased roadmap to evolve the single-vendor portal into a Flipkart-style multi-vendor marketplace. **No code is implemented from this file.** Implement one slice at a time, after this plan is approved, following RULE.md (stop-and-verify per task; TDD; smoke-run the real thing).
>
> **Supersedes** the single-vendor roadmap in `PLAN.md` (Phases 0–5 ✅, which become the *baseline* this plan builds on). Reads with `GAP_ANALYSIS.md`, `DOMAIN_MODEL.md`, `ARCHITECTURE_DECISIONS.md`, `MIGRATION_PLAN.md`, and `PARALLEL_EXECUTION_PLAN.md`.
> **Date:** 2026-06-19

---

## How To Read This

- Phases are prefixed **M** (marketplace) to distinguish from the legacy single-vendor phases. **M0 = the current baseline** (already done).
- Every phase is **independently deployable** (ADR-015): additive migrations, mocked external providers (ADR-010), feature-flagged where incomplete.
- Each phase lists the full template: *Objective · Business Value · Scope · Dependencies · DB work · Backend modules · Frontend pages · APIs · Events produced · Events consumed · Acceptance criteria · Risks · Complexity · Branch*.
- **Complexity** scale: S (1 slice) · M (2–4 slices) · L (5–8 slices) · XL (8+ slices, multi-surface).
- Parallelization is analyzed in `PARALLEL_EXECUTION_PLAN.md`; this file states each phase's hard dependencies.

**Status legend:** ⬜ Not Started · 🟡 In Progress · ✅ Done.

| Phase | Title | Complexity | Status |
|---|---|---|---|
| M0 | Single-vendor baseline | — | ✅ Done (was `PLAN.md` Phases 0–5) |
| M1 | Marketplace Foundation | M | ✅ Done (all 6 slices: seller domain/KYC-cipher · AuditService · security hardening · seller auth+ApprovedGuard · admin seller-mgmt API+notifications · admin UI; 327 API + 5 e2e + 160 admin tests; per-slice + whole-branch reviewed + live-smoke-verified; acceptance criteria §M1 met) |
| M2 | Seller System | L | 🟡 (slices 1–3 done & smoke-verified vs `ecom_dev`: 1 ownership migration B1–B5 + call-site fixes; 2 service-layer ownership scoping — `buildSellerScope` + products/inventory scoped, cross-tenant 404, admin unchanged; 3 seller product CRUD API at `/seller/products` + `SellerApprovedGuard` attaches `sellerId` + `@CurrentSeller`, seller isolation proven over HTTP (e2e: own CRUD, cross-tenant 404, non-seller 403). Next: slice 4 CSV bulk import) |
| M3 | Catalog V2 + Inventory V2 + Search (parallel group) | L | ⬜ |
| M4 | Reviews + Notifications (parallel group) | M | ⬜ |
| M5 | Order Split + Payments + Logistics (parallel group) | XL | ⬜ |
| M6 | Returns + Coupons/Promotions + Payouts (parallel group) | L | ⬜ |
| M7 | Analytics + Customers + CMS/Support + NFR Hardening (parallel group) | L | ⬜ |

---

## M0 — Single-Vendor Baseline (✅ Done — context only)

Already shipped (`PLAN.md` Phases 0–5): three apps scaffolded; auth (JWT access + rotating refresh, RBAC); product catalog + hierarchical categories + search/filter/sort; cart + pure server-authoritative totals pipeline; checkout/order placement; order state machine; append-only inventory ledger (reserve/release/deduct/restock + low-stock events); admin product/category/order/inventory management; storefront catalog/cart/checkout/order tracking. **This plan builds on it; do not rebuild it.**

---

## M1 — Marketplace Foundation

**Objective.** Establish the marketplace's identity and platform primitives without yet changing the buyer experience: the `SELLER` role, the `Seller`/KYC entity, the platform seller, the `AuditService`, the event-contract conventions, and baseline security hardening.

**Business Value.** Unblocks everything seller-related; closes the highest-severity security gaps (no rate limiting, audit table never written) before money/role-sensitive features land. Independently shippable — the existing single-vendor app keeps working unchanged.

**Scope.** `SELLER` role enum; `Seller` model + KYC fields; platform-seller seed; `SellerApprovedGuard`; `AuditService` (activate the existing `AuditLog`); domain-event conventions doc + helper; `@nestjs/throttler`, `helmet`, env-driven CORS; admin MFA columns (table only, flow optional later). **Not** in scope: seller-scoped products/orders (M2), changing checkout.

**Dependencies.** M0.

**DB work (`MIGRATION_PLAN.md`).** A1 (`Role += SELLER`), A2 (`Seller` table), A3 (seed platform seller), J3 (`User.mfaEnabled/mfaSecret`). No breaking changes.

**Backend modules.** New `sellers` module (profile CRUD scaffolding); new `audit` module (`AuditService`); `auth` (seller-register endpoint, `SellerApprovedGuard`); `app.module`/`main.ts` (throttler, helmet, CORS env). Activate `AuditService` in existing order-status/refund/inventory-adjust mutations.

**Frontend pages.** Admin: seller-management list + KYC review/approve/suspend (read works against seeded data); seller-register entry (storefront optional "Sell with us" link → register).

**APIs.** `POST /seller/register`; `GET/PATCH /seller/me`; `GET /admin/sellers`, `GET /admin/sellers/:id`, `PATCH /admin/sellers/:id/status`. Throttle `POST /auth/*` and `POST /seller/register`.

**Events produced.** `seller.registered`, `seller.kyc.approved`, `seller.kyc.rejected`. (Plus the event-contract conventions used by all later phases.)

**Events consumed.** `seller.*` → Notifications (admin review queue; seller KYC result). Audit consumes nothing (in-line via service).

**Acceptance criteria.** A user can register as a seller (`PENDING_REVIEW`); admin can approve/suspend; an approved seller passes `SellerApprovedGuard`, a suspended one is blocked. Every order-status/refund/stock-adjust mutation now writes an `AuditLog` row. Auth routes rate-limited; helmet headers present; CORS env-driven. All existing M0 tests still green; new flows smoke-verified vs `ecom_dev`.

**Risks.** Role-claim staleness (15m) on approval → status checked DB-side in the guard (ADR-005). Enum migration must be non-transactional (`MIGRATION_PLAN §2.1`). KYC PII → app-layer encrypt, never log.

**Complexity.** M.

**Branch / worktree.** `feat/marketplace-foundation`.

---

## M2 — Seller System

**Objective.** Make `Seller` a fully scoped tenant: sellers own their products and inventory, with strict resource-level isolation, plus the seller portal shell in the admin app.

**Business Value.** Sellers can self-serve their catalog and stock — the core of "multi-vendor." Establishes the isolation pattern every later seller feature reuses.

**Scope.** `Product.sellerId` + SKU namespace change (the one breaking migration); `InventoryItem.sellerId`; service-layer seller ownership scoping (ADR-008) across products + inventory; seller portal route group + shell in admin; seller product CRUD (incl. bulk CSV upload) and seller inventory management. **Not** in scope: order split (M5) — sellers can't yet receive split orders, but they own catalog/stock.

**Dependencies.** M1 (Seller entity, platform seller).

**DB work.** B1–B5 (`MIGRATION_PLAN §2.2`): add `sellerId` nullable → backfill → NOT NULL+FK → relax `sku` to `@@unique([sku, sellerId])`. **The one intentional breaking change** — ship B5 with its call-site fixes.

**Backend modules.** `products` (seller-scoped create/list/update; `findFirst({sku,sellerId})`; CSV import service); `inventory` (seller-scoped `listStock`/`getStockItem`/`adjust` via `requireItem`); `sellers` (extend). All seller-reachable methods apply `where.sellerId = actor.sub` when `role===SELLER`.

**Frontend pages.** Admin app **seller portal** group: seller dashboard shell, seller products (list/create/edit/CSV upload), seller inventory (stock list/adjust/movements). Reuse admin tables/forms/pagination components, scoped. Admin product views show "sold by".

**APIs.** Seller-scoped `GET/POST/PATCH /products` (+ `/products/import` CSV); `GET /inventory`, `GET /inventory/:productId`, `POST /inventory/:productId/movements` — all ownership-filtered. Admin retains cross-seller views.

**Events produced.** `product.created`, `product.updated` (feed future search index).

**Events consumed.** `inventory.low-stock` now also notifies the owning **seller** (extend the existing listener with seller targeting).

**Acceptance criteria.** Seller A creating a product owns it; Seller A cannot read/modify Seller B's product/inventory (→ 404); admin sees all; CSV upload creates multiple seller-scoped products. Existing admin-only product/inventory flows unchanged. `findUnique({sku})` call sites all migrated; build green. Cross-tenant isolation proven by tests. Smoke-verified vs `ecom_dev` (two seller accounts).

**Risks.** Cross-tenant leak if any seller-reachable query misses the scope → enforced in service layer + tests + review (ADR-008). The breaking SKU change → sequenced + same-PR call-site fixes (`MIGRATION_PLAN §2.2`). CSV import abuse (huge files) → size/row limits + validation.

**Complexity.** L.

**Branch / worktree.** `feat/seller-system`.

---

## M3 — Catalog V2 + Inventory V2 + Search (parallel group)

> Three sub-phases that can run concurrently once M2 lands (`PARALLEL_EXECUTION_PLAN.md`). Each is independently deployable.

### M3a — Catalog V2

**Objective.** Enrich the catalog for marketplace: seller-attributed product pages, seller storefront pages, richer product detail.
**Business Value.** Buyers see who sells what; sellers get a branded presence. **Scope.** Product detail shows seller + link; `/seller/:slug` storefront page (seller's active catalog); product rating placeholders wired (filled by M4). **Dependencies.** M2. **DB.** F2 (`Product.ratingAvg/ratingCount` cols — populated in M4). **Backend.** `products` (seller projection), `sellers` (public seller storefront read). **Frontend.** Storefront product detail "sold by", `/seller/[slug]` page. **APIs.** `GET /sellers/:slug` (public), product detail includes seller. **Events produced/consumed.** consumes `product.*` (cache bust later). **Acceptance.** Product page shows seller; seller storefront lists only that seller's ACTIVE products; SEO-friendly SSR. **Risks.** Leaking inactive products on seller page → status filter. **Complexity.** M. **Branch.** `feat/catalog-v2`.

### M3b — Inventory V2

**Objective.** Finalize seller-scoped inventory reporting (valuation, low-stock per seller) on the ledger.
**Business Value.** Sellers manage stock confidently; platform sees inventory health. **Scope.** Seller inventory reports (available vs reserved, low-stock, valuation); the ledger itself is unchanged (M0). **Dependencies.** M2 (`InventoryItem.sellerId`). **DB.** none beyond B2/B4. **Backend.** `inventory` (seller-scoped report queries). **Frontend.** Seller inventory reports; admin inventory valuation. **APIs.** `GET /inventory/reports` (seller-scoped + admin cross-seller). **Events.** consumes `inventory.low-stock` (already). **Acceptance.** Seller sees only their stock + low-stock; valuation = Σ available×price; admin cross-seller. **Risks.** Valuation on hot path → indexed query / matview if heavy. **Complexity.** S–M. **Branch.** `feat/inventory-v2`.

### M3c — Search

**Objective.** Replace `contains` search with ranked full-text + autocomplete + faceted filters behind a provider interface.
**Business Value.** Discovery quality (PRD: <3s p90, autocomplete, facets) — the top driver of conversion. **Scope.** `ProductSearch` provider (ADR-009); Postgres GIN FTS default (ADR-011); autocomplete; facets (brand/category/price/rating). Elasticsearch adapter deferred. **Dependencies.** M2 (seller-scoped catalog). **DB.** K2 (GIN FTS index, raw SQL `CONCURRENTLY`). **Backend.** `search` module (interface + Postgres impl); consumes `product.*` for future ES sync. **Frontend.** Storefront autocomplete + faceted filter UI (extends `CatalogFilters`). **APIs.** `GET /products/search` (facets), `GET /products/suggest`. **Events produced.** none. **Events consumed.** `product.created/updated` (index sync seam). **Acceptance.** Ranked FTS results; autocomplete suggestions; facet filters; p90 < 3s on seed data; provider swappable by env. **Risks.** FTS index lock → `CONCURRENTLY`. Data/index drift when ES added → rebuild from events. **Complexity.** M. **Branch.** `feat/search-v2`.

---

## M4 — Reviews + Notifications (parallel group)

### M4a — Reviews & Ratings

**Objective.** Verified-purchase reviews + ratings with average displayed on product pages.
**Business Value.** Trust → conversion (PRD: "crucial for trust"). **Scope.** `Review` model; verified-purchase gate; rating aggregate maintained on publish; moderation. **Dependencies.** M5 order split for *verified* flag is ideal, but reviews can ship gated on legacy `DELIVERED` orders first, then tighten to SubOrder when M5 lands. (Soft dependency — see `PARALLEL_EXECUTION_PLAN.md`.) **DB.** F1 (`Review` + CHECK 1..5), F2 used. **Backend.** `reviews` module; updates `Product.ratingAvg/Count` via `review.published`. **Frontend.** Storefront review form + list + stars; admin moderation queue. **APIs.** `POST /products/:id/reviews`, `GET /products/:id/reviews`, admin moderate. **Events produced.** `review.published`. **Events consumed.** `review.published` → rating aggregate, `NEW_REVIEW` notification [S]. **Acceptance.** Only delivered-purchasers can post a verified review; one review per product per customer; avg + count shown; moderation works. **Risks.** Fake reviews → verified gate. AVG on hot path → denormalized aggregate. **Complexity.** M. **Branch.** `feat/reviews`.

### M4b — Notifications (fire + consume)

**Objective.** Generalize the event→notification pipeline beyond low-stock, and add the consumption UX.
**Business Value.** PRD-required confirmations/updates for customers, sellers, admins; the connective tissue for every domain event. **Scope.** Emit `auth.registered`, `order.placed` (NEW_ORDER), seller/return/payout events at their sources; generalize the listener; `NotificationChannel` provider (email/SMS mock, ADR-010); notification feed UI. **Dependencies.** M1 (event conventions). **DB.** K1 (new `NotificationType` values). **Backend.** `notifications` (controller + generalized listeners + channel provider). **Frontend.** Notification feed/badge in storefront + admin/seller. **APIs.** `GET /notifications`, `PATCH /notifications/:id/read`. **Events produced.** none (consumer). **Events consumed.** all domain events with a notification (`DOMAIN_MODEL §6`). **Acceptance.** Registration/order-confirmation notifications fire post-commit; feed displays + mark-read; mock channel logs sends; no emit-on-rollback. **Risks.** Emit-on-rollback → reuse post-commit pattern. Channel failures → log, don't swallow. **Complexity.** M. **Branch.** `feat/notifications`.

---

## M5 — Order Split + Payments + Logistics (parallel group, the keystone)

> The buyer-experience transformation. The order-split sub-phase is the hardest single piece; payments and logistics attach to the new topology. These can be developed in parallel but **integrate** at checkout.

### M5a — Order Split (Fulfillment)

**Objective.** Split a multi-seller cart into one `Order` + N `SubOrder`s; move the state machine + stock side-effects onto `SubOrder`; `Order.status` becomes a rollup.
**Business Value.** Independent seller fulfillment — the structural core of a marketplace. **Scope.** `SubOrder`/`SubOrderItem`; per-seller totals via the pure pipeline; reserve per SubOrderItem; transitions on SubOrder; `rollupOrderStatus`; backfill legacy orders. **Dependencies.** M2 (`Product.sellerId`). **DB.** C1–C3 (`MIGRATION_PLAN §2.3`). **Backend.** `orders`/`fulfillment` (`placeOrder` groups by seller; `updateStatus` on SubOrder + rollup; movements reference `subOrderId`); reuse `order-status.ts` + totals pipeline (ADR-014). **Frontend.** Storefront order detail per-seller groups; seller fulfillment queue; admin Order+SubOrders. **APIs.** `POST /orders` (split), seller `GET /seller/suborders` + `PATCH /seller/suborders/:id/status`, customer/admin order views. **Events produced.** `order.placed`, `suborder.status.changed`. **Events consumed.** drives inventory release/deduct/restock (in-tx). **Acceptance.** A 3-seller cart → 1 Order + 3 SubOrders, each independently transitionable; stock accounting correct per SubOrder; `Order.status` rolls up; legacy orders backfilled (counts validated); totals parity holds. **Risks.** Rollup drift → same-tx recompute. Backfill correctness → idempotent + row-count asserts. **Complexity.** XL. **Branch.** `feat/order-split`.

### M5b — Payments

**Objective.** Real payment lifecycle behind a provider interface: intent → capture (webhook) → status; COD path; refund primitive.
**Business Value.** Actual transactions (PRD: Razorpay/PayU, UPI, card, wallet, COD). **Scope.** `Payment`/`Transaction`/`Refund`; `PaymentProvider` interface + mock (ADR-009/010); webhook (signed, idempotent); COD; checkout payment step. **Dependencies.** M5a (Order to pay for). **DB.** D1. **Backend.** `payments` module + provider. **Frontend.** Checkout payment-method step; order payment status; admin payment views. **APIs.** `POST /payments/intent`, `POST /payments/webhook/:provider`, COD on placement. **Events produced.** `payment.captured`, `payment.failed`. **Events consumed.** `order.placed` (create intent). **Acceptance.** Online flow (mock) authorizes→captures via webhook idempotently; COD confirms on placement; captured payment confirms order; no raw card data anywhere; signature verified. **Risks.** PCI scope → tokenization/redirect (ADR-013). Double capture → idempotency key. **Complexity.** L. **Branch.** `feat/payments`.

### M5c — Logistics

**Objective.** Shipments + tracking + shipping-rate quoting behind a provider interface.
**Business Value.** Fulfillment transparency (PRD: courier APIs, labels, tracking, SMS). **Scope.** `Shipment`/`ShipmentEvent`/`ShippingRate`; `ShippingProvider` mock; rate quote feeds per-seller `shippingTotal`; SHIPPED creates a Shipment; tracking webhooks. **Dependencies.** M5a (SubOrder to ship). **DB.** H1. **Backend.** `logistics` module + provider. **Frontend.** Checkout shipping-method step; tracking timeline on order detail; seller dispatch UI. **APIs.** `GET /shipping/quote`, `POST /shipping/webhook/:provider`, shipment create on SHIPPED. **Events produced.** `shipment.event`. **Events consumed.** `suborder.status.changed` (SHIPPED → create shipment). **Acceptance.** Rate quote feeds shipping total; SHIPPED creates a shipment; tracking timeline renders from events; mock provider end-to-end. **Risks.** Webhook spoofing → signature verify. Rate accuracy → snapshot quoted rate. **Complexity.** M. **Branch.** `feat/logistics`.

---

## M6 — Returns + Coupons/Promotions + Payouts (parallel group)

### M6a — Returns / RMA

**Objective.** Customer-initiated returns → approve → receive → refund-to-payment, with restock.
**Business Value.** Post-sale trust (PRD refund module + SLAs). **Scope.** `ReturnRequest` state machine; restock on receipt (existing primitive); `Refund` against `Payment`. **Dependencies.** M5a (SubOrder), M5b (Payment). **DB.** E1. **Backend.** `returns` module. **Frontend.** Customer return UI; seller/admin return queues. **APIs.** `POST /suborders/:id/returns`, approve/reject/receive. **Events produced.** `return.requested`, `return.approved`. **Events consumed.** drives restock + refund. **Acceptance.** Customer requests within policy; approval → pickup → ITEM_RECEIVED restocks + refunds against captured payment; SLAs tracked. **Risks.** Refund before capture → guard on CAPTURED. Fraud → require ITEM_RECEIVED. **Complexity.** M. **Branch.** `feat/returns`.

### M6b — Coupons / Promotions

**Objective.** Platform + seller coupons applied through the per-seller totals pipeline.
**Business Value.** Marketing/conversion levers (PRD discounts/coupons). **Scope.** `Coupon`/`CouponUsage`; apply at cart/checkout (platform → grand total, seller → SubOrder); seller coupon creation w/ admin approval. **Dependencies.** M5a (per-seller totals). **DB.** G1. **Backend.** `promotions` module; integrates with totals pipeline (`discountTotal`). **Frontend.** Coupon field in checkout; seller coupon management; admin approval. **APIs.** `POST /cart/coupon`, seller coupon CRUD, admin approve. **Events produced.** `coupon.applied`. **Events consumed.** none. **Acceptance.** Valid coupon reduces the correct scope's discount; usage caps + per-user limits enforced atomically; seller coupons need approval. **Risks.** Over-redemption/races → atomic increment + unique usage. **Complexity.** M. **Branch.** `feat/promotions`.

### M6c — Seller Payouts & Commission

**Objective.** Compute commission and create per-SubOrder payouts on settlement.
**Business Value.** Sellers get paid; platform earns commission; reconciliation (PRD financial controls). **Scope.** `SellerPayout`; commission = `Seller.commissionRate ?? platform default`; payout on DELIVERED + captured; `PayoutProvider` mock. **Dependencies.** M5a, M5b. **DB.** I1. **Backend.** `payouts` module. **Frontend.** Seller earnings dashboard; admin payout/commission reconciliation. **APIs.** `GET /seller/payouts`, admin payout views. **Events produced.** `payout.initiated`, `payout.completed`. **Events consumed.** `suborder.status.changed` (DELIVERED), `payment.captured`. **Acceptance.** One payout per SubOrder (net = gross − commission); rate snapshotted; audit-logged; admin reconciliation. **Risks.** Duplicate payout → `@@unique([subOrderId])`. Commission error → snapshot rate + audit. **Complexity.** M. **Branch.** `feat/payouts`.

---

## M7 — Analytics + Customers + CMS/Support + NFR Hardening (parallel group)

### M7a — Analytics

**Objective.** Admin + seller analytics from read-mostly aggregations (matviews), exportable.
**Business Value.** Decision-making dashboards (PRD KPIs: revenue, AOV, conversion, best sellers, valuation, new-vs-returning). **Scope.** Matviews + refresh; admin + seller-scoped analytics; CSV export. **Dependencies.** M5 (orders/payments data). **DB.** matview migrations (raw SQL). **Backend.** `analytics` module (fill the stub). **Frontend.** Admin analytics dashboard (replace placeholders); seller analytics. **APIs.** `GET /admin/analytics/*`, `GET /seller/analytics/*`, CSV. **Events consumed.** `suborder.status.changed`, `order.placed` (incremental refresh trigger). **Acceptance.** KPIs computed from matviews (not hot path); seller sees own metrics; admin cross-platform; CSV export. **Risks.** Stale matviews → scheduled refresh + "as of". **Complexity.** M. **Branch.** `feat/analytics`.

### M7b — Customer Management

**Objective.** Admin customer profiles, order history, spending. **Business Value.** Support + insight (PRD admin customers). **Scope.** Fill the `customers` stub. **Dependencies.** M5 (order data). **DB.** none (reuse relations; optional spend view). **Backend.** `customers` module. **Frontend.** Admin customer list + detail. **APIs.** `GET /admin/customers`, `GET /admin/customers/:id`. **Acceptance.** Paginated customers; profile + order history + spend; admin-only. **Risks.** PII → admin-only + audit access. **Complexity.** S. **Branch.** `feat/customers`.

### M7c — CMS + Support

**Objective.** CMS for static pages/banners; support ticketing. **Business Value.** Content control + customer support (PRD CMS + helpdesk/tickets). **Scope.** `ContentPage` CRUD; `SupportTicket`/`TicketMessage`. **Dependencies.** M1. **DB.** J1, J2. **Backend.** `cms`, `support` modules. **Frontend.** Storefront CMS pages + support ticket UI; admin CMS editor + ticket queue. **APIs.** CMS CRUD, ticket CRUD/messages. **Acceptance.** Published pages render in storefront; banners configurable; customers open tickets, agents respond. **Risks.** XSS via CMS HTML → sanitize. **Complexity.** M. **Branch.** `feat/cms-support`.

### M7d — NFR Hardening

**Objective.** Production-readiness: caching, observability, CI/CD, accessibility, admin cookie migration.
**Business Value.** PRD NFRs (performance, reliability, security, accessibility). **Scope.** Redis `CacheProvider` (event-driven busting on `product.*`); global logging/metrics interceptor + exception filter; health checks; CI/CD + containerization; WCAG pass (replace `window.confirm` with accessible modal, `jsx-a11y` in admin); admin/seller httpOnly cookie migration (ADR-017); refresh-family invalidation + reset-confirm TOCTOU fix; optional admin MFA flow. **Dependencies.** spans all (apply last). **DB.** none (MFA cols from M1). **Backend.** cross-cutting interceptors/filters, cache, throttler tuning. **Frontend.** accessible modal, a11y lint, cookie session migration. **APIs.** `GET /health`. **Acceptance.** Cache hits on hot reads with event busting; structured logs + metrics; health checks; WCAG-AA on key flows; admin on httpOnly cookies; load test meets PRD p90 targets. **Risks.** Cache invalidation → event-driven bust. Cookie migration touches admin auth → schedule deliberately (ADR-017). **Complexity.** L. **Branch.** `feat/nfr-hardening`.

---

## Dependency Summary (hard edges)

```
M0 (done)
  └─► M1 Foundation
        └─► M2 Seller System
              ├─► M3 (Catalog V2 ∥ Inventory V2 ∥ Search)
              ├─► M5a Order Split ──► M5b Payments ∥ M5c Logistics
              └─► M6b Coupons (needs M5a totals)
M1 ─► M4b Notifications (∥ with M3/M4)
M2 ─► M4a Reviews (soft-tightens on M5a)
M5a+M5b ─► M6a Returns
M5a+M5b ─► M6c Payouts
M5 ─► M7a Analytics, M7b Customers
M1 ─► M7c CMS/Support
ALL ─► M7d NFR Hardening (last)
```

Full parallelization analysis, blocking phases, and worktree assignments: **`PARALLEL_EXECUTION_PLAN.md`**.

---

## Execution Discipline (per RULE.md)

- **One slice at a time**, stop and verify before the next (RULE.md §1). A phase is many slices.
- **TDD** (red→green→refactor) for domain-critical logic: order split, totals, payments, ownership scoping, state machines (RULE.md §4).
- **Smoke-run the real thing** vs `ecom_dev` / running apps before "done" (RULE.md §5).
- **Keep this file + per-phase status updated**; on phase completion produce the RULE.md §6 resume prompt.
- **No `git push` without explicit permission** (RULE.md §3); the user merges PRs (per memory `workflow-merge-then-resume`).
