# GAP_ANALYSIS.md — Single-Vendor Portal → Flipkart-Style Marketplace

> **Status:** Architecture document. No code is implemented from this file. It is the evidence base for `DOMAIN_MODEL.md`, `ARCHITECTURE_DECISIONS.md`, `MIGRATION_PLAN.md`, `IMPLEMENTATION_PLAN.md`, and `PARALLEL_EXECUTION_PLAN.md`.
>
> **PRD:** `docs/new_REQ/Flipkart-Style E-Commerce Platform PRD.pdf`
> **Current roadmap (single-vendor):** `PLAN.md` (Phases 0–5 ✅ Done; 6–7 not started)
> **Date:** 2026-06-19

---

## 0. Executive Summary

The repository today is a **complete, well-tested single-vendor e-commerce portal**. Phases 0–5 of `PLAN.md` are done and merged: authentication (JWT access + rotating refresh, RBAC), product catalog (CRUD, hierarchical categories, search/filter/sort), cart + server-authoritative totals pipeline, checkout/order placement, the order state machine, and the append-only inventory ledger (reserve/release/deduct/restock + low-stock alerts). Three apps are scaffolded and working: `apps/api` (NestJS + Prisma), `apps/storefront` (Next.js), `apps/admin` (React + Vite). ~368 unit/component tests across the apps; smoke-verified against `ecom_dev`.

The PRD describes a **fundamentally different product**: a multi-vendor marketplace with **Sellers as a first-class role**, per-seller catalog and inventory, a multi-seller cart that splits into per-seller fulfillments, real payments (Razorpay/PayU, COD, wallets, GST invoicing), returns/RMA, logistics/shipment tracking, coupons/promotions, product reviews, seller payouts/commissions, customer support, and a microservice-ready, event-driven architecture.

**The single-vendor code is an asset, not a liability.** Three design decisions in the existing codebase make the marketplace an *evolution* rather than a rewrite:

1. **The totals pipeline is pure and single-sourced** (`cart/totals.ts`, `cart/cart-pricing.ts`) — shared by cart and order. It needs to run **per seller group** and aggregate; the function stays the calculation authority.
2. **The order state machine is an isolated pure module** (`orders/order-status.ts`) — it migrates to operate on a per-seller **SubOrder** with zero logic change.
3. **The inventory ledger is append-only and transaction-joinable** (`inventory/inventory.service.ts`, primitives take an optional `tx`) — once stock is seller-scoped, the primitives barely change.

**Chosen stance (confirmed with the user):** *Evolve in place* — additive schema changes, no breaking changes unless absolutely necessary; *modular monolith with abstracted seams* — keep NestJS modular, add an event bus and provider interfaces (payment/search/shipping) so external vendors and microservice extraction are drop-in later; *seller portal inside the existing admin app* under a new `SELLER` role.

**The single non-additive change** that is genuinely required: relaxing `Product.sku @unique` to `@@unique([sku, sellerId])` so two sellers can own the same SKU string. This is sequenced safely in `MIGRATION_PLAN.md` (after `sellerId` backfill) and is the one place a compile-time break is *intentional* (it surfaces every `findUnique({where:{sku}})` call site).

---

## 1. Classification Legend

| Tag | Meaning |
|---|---|
| **✅ Fully Implemented** | Exists and meets PRD intent; little/no change. |
| **🟡 Partially Implemented** | Foundation exists; needs extension for marketplace semantics. |
| **🔴 Missing** | Does not exist; net-new build. |
| **🟠 Needs Refactor** | Exists but a single-vendor assumption must be reshaped (the work is mostly *changing* code, not adding it). |

Every 🟡 / 🔴 / 🟠 row below is expanded in §3 with: **why required · DB changes · API changes · Frontend changes · migration strategy · risks & mitigation.**

---

## 2. Feature Classification Matrix

### 2.1 Identity, Roles & Security

| PRD Feature | Status | Evidence / Note |
|---|---|---|
| Customer registration / login / logout / password reset | ✅ | `auth.service.ts`; JWT access (15m) + rotating refresh (7d, SHA-256 digest stored), enumeration-safe reset. |
| RBAC (role-level guards) | ✅ | Global `JwtAuthGuard` + `RolesGuard` via `APP_GUARD`; `@Roles`/`@Public`/`@CurrentUser`. New roles need only the enum value + annotations. |
| **SELLER role** | 🔴 | `Role` enum = `CUSTOMER/ADMIN/INVENTORY_MANAGER` only. |
| **Seller self-registration + KYC (GSTIN/PAN/bank) + admin approval** | 🔴 | No `Seller`/`SellerProfile` model; `register` hardcodes `CUSTOMER`. |
| **Resource-level (seller) ownership scoping** | 🔴 | Ownership pattern exists for orders (`where:{id,userId}`) but products/inventory are unscoped (admin-only). Adding `SELLER` to those guards *without* ownership filters = cross-tenant leak. |
| **Audit logging of sensitive mutations** | 🟠 | `AuditLog` model exists but is **never written** — zero `prisma.auditLog.create` calls. PRD + CLAUDE.md require it. |
| **Rate limiting** (login/register/reset) | 🔴 | No `@nestjs/throttler`; `main.ts` has only `ValidationPipe` + CORS. |
| **Security headers (helmet), env-driven CORS** | 🟠 | CORS hardcoded to `:5001`/`:5002`; no helmet. |
| **MFA for admin (optional)** | 🔴 | No MFA infrastructure. PRD marks it optional. |
| Admin token storage (XSS) | 🟠 | Admin uses `localStorage` (known tradeoff, flagged in `PLAN.md`); storefront uses httpOnly cookies. |
| Input validation (DTOs) | ✅ | Global `ValidationPipe` `whitelist + forbidNonWhitelisted + transform`. |
| Refresh-token reuse/family invalidation | 🟡 | Rotation soft-revokes the old token but no proactive family invalidation on replay. |
| Password-reset confirm TOCTOU | 🟡 | TODO-flagged race; needs atomic `UPDATE … WHERE usedAt IS NULL`. |

### 2.2 Catalog, Search & Discovery

| PRD Feature | Status | Evidence / Note |
|---|---|---|
| Hierarchical categories + navigation | ✅ | `categories` module: self-referential tree, cycle guard, soft-delete-if-unused. |
| Product CRUD (all PRD fields) + lifecycle | ✅ | `products` module: create/update/archive/activate; soft delete; SSR catalog + admin UI. |
| **Per-seller product ownership** | 🟠 | `Product` has no `sellerId`. Catalog is platform-owned. |
| Product detail (images, pricing, availability, related) | ✅ | `products/[id]`; related = same-category heuristic (PRD excludes rec-engine). |
| **Full-text search + autocomplete + synonyms + faceted filters** | 🟡 | Search = Prisma `contains` OR over name/sku/description (`products.service.ts buildWhere`). No FTS, no autocomplete, no facets, no analytics. PRD wants Elasticsearch-class search. |
| **Reviews & ratings (verified-purchase, avg rating)** | 🔴 | No `Review` model anywhere. |
| **Personalization / "customers also bought"** | 🔴 | Out — but PRD lists it. Treat as low-priority/optional (rec-engine is in CLAUDE.md "out of scope"; PRD mentions it). |

### 2.3 Cart & Checkout

| PRD Feature | Status | Evidence / Note |
|---|---|---|
| Persistent server-backed cart (per user) | ✅ | `cart` module; partial-unique index (1 cart/authed user, many guest carts). |
| Add/remove/update qty, live pricing | ✅ | Authoritative-replace; sale price resolved server-side. |
| **Multi-seller cart (items from many sellers, split by seller)** | 🟠 | Cart works but has no seller concept; totals are one global block. |
| Server-authoritative totals pipeline (`subtotal→discount→tax→shipping→grand`) | ✅ | Pure `computeTotals`/`priceItems`; one source for cart + order. |
| **Per-seller shipping & tax sub-totals** | 🟠 | One flat shipping line, one tax rate, one free-ship threshold for the whole basket. |
| **Coupons / promo codes at checkout** | 🔴 | `discountTotal` always `0`; no `Coupon` model. |
| Multi-step checkout (address → shipping method → payment → review) | 🟡 | Single-step checkout (address + review + place). No shipping-method selection, no payment step. |
| **Payment options (Razorpay/PayU, UPI, card, wallet, COD)** | 🔴 | No payment model; checkout = create order (`PENDING`), no capture. |
| **GST invoice generation** | 🔴 | Not present. |

### 2.4 Orders, Fulfillment & Logistics

| PRD Feature | Status | Evidence / Note |
|---|---|---|
| Order creation + history + detail | ✅ | `orders` module; ownership-scoped reads; admin all-orders read. |
| Order state machine (Pending→…→Delivered + Cancelled/Refunded) | ✅ | `order-status.ts` pure guard; transitions enforced server-side. |
| Inventory reserve/deduct/release + restock-on-refund | ✅ | Ledger primitives wired into placement/cancel/ship/refund, atomic with status. |
| **Per-seller order splitting (SubOrder/fulfillment)** | 🟠 | One `Order` = one status, one totals block, one shipping line. Sellers cannot ship/track/be-paid independently. **The hardest change.** |
| **Returns / RMA workflow (request→approve→pickup→inspect→refund)** | 🔴 | No `ReturnRequest`. Refund today is admin-only `DELIVERED→REFUNDED` with restock; no customer-initiated flow. |
| **Refunds to bank/wallet via gateway** | 🟡 | Status transition + restock exist; no money movement (no payment to refund against). |
| **Logistics integration (courier APIs, label, tracking, SMS/push)** | 🔴 | No `Shipment`/tracking; status is manual admin action. |
| **Shipping rate calculation (weight/dims/zone)** | 🔴 | Flat-rate config only. |
| Warehouse routing / multi-warehouse | 🔴 | Out (CLAUDE.md "out of scope"). PRD says "not mandatory for MVP." Defer. |

### 2.5 Seller Experience

| PRD Feature | Status | Evidence / Note |
|---|---|---|
| **Seller dashboard (new orders, sales stats, pending actions)** | 🔴 | No seller portal. |
| **Seller product management (incl. bulk CSV upload)** | 🔴 | Product CRUD is admin-only; no seller scoping; no CSV. |
| **Seller inventory management** | 🟠 | Inventory ledger exists; not seller-scoped; admin/IM-only. |
| **Seller analytics & exportable reports** | 🔴 | `analytics` module is an empty stub. |
| **Seller promotions (discounts, with admin approval)** | 🔴 | No promotion model. |
| **Seller payouts / commission calculation** | 🔴 | No payout/commission model. |

### 2.6 Admin & Platform Operations

| PRD Feature | Status | Evidence / Note |
|---|---|---|
| Admin product/category/order/inventory management | ✅ | Admin app: products, categories, orders (list/detail/transitions/refund), inventory (stock/low-stock/adjust/movements). |
| **Seller management (review KYC, approve, suspend)** | 🔴 | No seller entity to manage. |
| **Customer management (profiles, order history, spending)** | 🔴 | `customers` module is an empty stub. |
| **Analytics dashboard (revenue, AOV, conversion, best sellers, inventory valuation, new-vs-returning)** | 🔴 | `analytics` stub; admin Dashboard shows one real card + honest placeholders. |
| **Commission / financial reconciliation** | 🔴 | None. |
| **Content management (CMS: About/Terms, banners, promotions)** | 🔴 | None. |
| Notifications **fire** on domain events | 🟡 | Only `LOW_STOCK` is wired (1 producer, 1 listener). Order/registration/shipping/new-order/refund events exist as enum values but nothing emits/consumes them. |
| Notifications **display/consume** (storefront + admin) | 🔴 | No notification feed UI; no `notifications` controller. |

### 2.7 Non-Functional & Platform

| PRD Feature | Status | Evidence / Note |
|---|---|---|
| Pagination + indexes on list endpoints | ✅ | Consistent `{data,page,pageSize,total,totalPages}`; FK + sort indexes. |
| **Event-driven architecture (decoupled domain events)** | 🟡 | `@nestjs/event-emitter` wired; only inventory uses it. Orders→inventory is a *direct service call*. Bus is the seam to lean on. |
| **Caching (Redis), CDN** | 🔴 | None. |
| **Search engine (Elasticsearch/Solr)** | 🔴 | DB `contains` only. |
| **Message broker (Kafka/RabbitMQ)** | 🔴 | In-process emitter only (sufficient for monolith; broker is the extraction seam). |
| **Microservice readiness** | 🟡 | Clean module boundaries already; needs explicit provider interfaces + event contracts. |
| Observability (metrics, centralized logging, alerts) | 🔴 | No interceptors/filters; default Nest logging. |
| CI/CD, containerization, health checks | 🔴 | Not present in repo. |
| Performance targets (search <3s, page <2s, 10× burst) | 🟡 | Indexed + paginated; not load-tested; no caching/search infra. |
| Accessibility (WCAG) | 🟡 | DESIGN.md tokens, semantic colors; `window.confirm` flagged for accessible-modal replacement; admin lacks `jsx-a11y`. |

---

## 3. Detailed Gap Dossiers (Missing / Partial / Refactor)

Each dossier: **why required · DB · API · Frontend · migration strategy · risks & mitigation.** Sketches are illustrative; canonical models live in `DOMAIN_MODEL.md` and ordering in `MIGRATION_PLAN.md`.

---

### 3.1 🔴 SELLER role + Seller account & KYC

**Why required.** A marketplace's defining entity is the seller. Without a `Seller` identity, products/inventory/orders/payouts cannot be attributed, scoped, or paid. The PRD's seller journey (self-onboard → KYC → approve → list → fulfill → get paid) is impossible otherwise.

**DB.** Add `SELLER` to `Role` enum (additive `ALTER TYPE ADD VALUE`). New `Seller` model 1:1 with `User` (`userId @unique`): `displayName`, `slug @unique`, `status` (`PENDING_REVIEW/ACTIVE/SUSPENDED/DEACTIVATED`), KYC fields (`gstin?`, `pan?`, `bankAccountNo?` *encrypted at app layer*, `bankIfsc?`, `kycVerifiedAt?`), optional `commissionRate Decimal(5,4)`, soft-delete + indexes on `status` and `[deletedAt, createdAt]`.

**API.** `POST /seller/register` (creates `User{role:SELLER}` + `Seller{status:PENDING_REVIEW}`); `GET/PATCH /seller/me` (profile); admin `GET /admin/sellers`, `PATCH /admin/sellers/:id/status` (approve/suspend). A `SellerApprovedGuard` (role-level: blocks sellers whose `status != ACTIVE` from seller-scoped mutations). Register endpoint must **not** reuse the customer path that hardcodes `CUSTOMER`.

**Frontend.** Admin app: new `SELLER`-scoped route group (seller portal) + admin seller-management pages (KYC review queue, approve/suspend). Storefront: optional "sell on platform" entry + seller storefront page (`/seller/:slug`).

**Migration strategy.** Enum value in its own non-transactional migration (PostgreSQL forbids `ADD VALUE` in a txn). Create `Seller` table. Seed a **"Platform Seller"** linked to the existing admin user (needed for backfilling existing products — see 3.2). Idempotent upsert in `seed.ts`.

**Risks & mitigation.** *Cross-tenant authorization* is the dominant risk — see 3.3. *Role drift*: role is a JWT claim, so an approval/suspension takes up to 15m to reflect; mitigate by checking `Seller.status` in a guard for sensitive seller mutations (DB-backed), not the claim. *KYC PII*: encrypt bank fields at the application layer; never log them.

---

### 3.2 🟠 Product ownership (`Product.sellerId`) + SKU namespace

**Why required.** Products must belong to a seller for catalog attribution, seller-scoped management, per-seller inventory, and payout.

**DB.** Add `sellerId String?` + relation + `@@index([sellerId])` to `Product`. **Single-seller-per-product** model (recommended; see ADR-007): each product row has exactly one seller; two sellers selling the "same" item create two rows. Consequence: relax `sku @unique` → `@@unique([sku, sellerId])` so each seller owns its SKU namespace.

**API.** `ProductsService.create` sets `sellerId` from the authenticated seller (or admin-supplied). List/detail/mutations gain seller scoping (§3.3). Any `findUnique({where:{sku}})` becomes `findFirst({where:{sku,sellerId}})`.

**Frontend.** Seller portal product CRUD (scoped to own products). Admin product views show "sold by". Storefront product page shows seller name + link.

**Migration strategy (the one intentional breaking change).** Sequenced (full detail in `MIGRATION_PLAN.md`): (1) add `sellerId` nullable; (2) deploy code that writes `sellerId` on new products; (3) backfill `UPDATE Product SET sellerId = <platform-seller>`; (4) set NOT NULL + FK; (5) **only then** drop `Product_sku_key`, add `@@unique([sku, sellerId])`. The composite-unique change makes Prisma drop `sku` from the `findUnique` type — a deliberate compile error that flags every call site to fix.

**Risks & mitigation.** *NOT NULL before backfill fails* → nullable-first + backfill. *Composite unique before `sellerId` NOT NULL* allows `(sku, NULL)` duplicates → enforce ordering. *Existing `findUnique({sku})` breaks silently at runtime* → the compile error is the safety net; do the constraint change in the same PR as the call-site fixes.

---

### 3.3 🔴 Seller-scoped (resource-level) authorization / multi-tenant isolation

**Why required.** Adding `SELLER` to existing `@Roles(ADMIN, INVENTORY_MANAGER)` decorators on products/inventory **without ownership filters** lets Seller A read/modify Seller B's stock, products, and orders. This is the single largest security risk of the evolution.

**DB.** None beyond `sellerId` on `Product`/`InventoryItem` (3.2, 3.7).

**API.** Adopt the existing **service-layer ownership** pattern (already used for customer orders, `orders.service.ts:375`). Rule: ownership is a **`WHERE` predicate**, never a post-fetch filter and never a guard (guards lack the resolved resource id). Pattern:
```ts
if (actor.role === Role.SELLER) where.sellerId = actor.sub;   // admin bypasses
```
Mismatched owner → **`NotFoundException`** (information hiding), consistent with orders. Seller order view = read-only projection: `where:{ subOrders:{ some:{ sellerId: actor.sub }}}` (post-SubOrder split, §3.4).

**Frontend.** Seller portal only ever requests its own scope; admin sees all.

**Migration strategy.** Land *with* §3.1/§3.2 — never expose a seller-reachable route before its ownership filter exists.

**Risks & mitigation.** *Leak via pagination totals* → filter in the query so `count` is also scoped. *Guard-based ownership temptation* → explicitly forbidden in ADR-008; use service-layer scope. *Payout/inventory isolation* → every seller read/write carries `sellerId`; admin-only for cross-seller views.

---

### 3.4 🟠 Per-seller order splitting (Order → SubOrder → Shipment)

**Why required.** A buyer pays once for a basket spanning sellers A/B/C, but each seller must confirm/ship/track/refund **independently** and be paid for **their** items. One shared `Order.status` cannot represent three independent fulfillment lifecycles.

**DB.** Introduce `SubOrder` (one per seller per order) carrying its **own** status state machine + per-seller five-part totals + a copy of the shipping snapshot; `SubOrderItem` (snapshots, + `sellerName`); `Shipment` + `ShipmentEvent` per SubOrder. `Order` keeps the cross-seller grand total, customer ref, payment ref, address snapshot; `Order.status` becomes a **cached rollup** updated in the same transaction as any SubOrder transition. Keep `OrderItem` temporarily (backfill source), drop later.

**API.** `placeOrder` groups cart items by `Product.sellerId`, runs the totals pipeline **per group**, creates one `Order` + N `SubOrder`s in one transaction, reserves stock per `SubOrderItem`. The pure state machine (`order-status.ts`) now drives `SubOrder.status`; a `rollupOrderStatus` helper recomputes `Order.status`. Seller endpoints act on their SubOrders; customer sees the Order with per-seller breakdown.

**Frontend.** Storefront order detail shows per-seller groups + per-shipment tracking. Seller portal fulfillment queue = their SubOrders. Admin sees Order + all SubOrders.

**Migration strategy.** Add `SubOrder`/`SubOrderItem` (FKs NOT NULL). Backfill: for each existing `Order`, create one `SubOrder` (platform seller) and copy `OrderItem`→`SubOrderItem` + totals + ship snapshot. Only then route seller fulfillment through SubOrders. `OrderItem` dropped in a later migration once all read paths move.

**Risks & mitigation.** *Rollup drift* → update `Order.status` in the same `$transaction` as the SubOrder transition (not a DB trigger — keep logic in the service). *Backfill correctness* → idempotent script, verify counts (`OrderItem` rows == `SubOrderItem` rows). *Inventory double-count* → movements reference `subOrderId`; deduct touches `reserved`, restock touches `available` (existing invariant preserved).

---

### 3.5 🔴 Payments (gateway, COD, wallet, refunds) + PCI-DSS

**Why required.** "Checkout = create order" is explicitly *current* behavior; the PRD requires real payment capture, multiple methods, and gateway refunds. Seller payouts depend on captured payments.

**DB.** `Payment` (1:1 `Order`, `method`, `status`, `amount Decimal(12,2)`, `currency`, `gatewayRef?`, `gatewayPayload Json?`, `capturedAt?`); `Transaction` (charge/refund/chargeback ledger); `Refund` (against `Payment`, optionally linked to `ReturnRequest`). **No `cardNumber/cvv/expiry` columns ever.**

**API.** `PaymentProvider` interface (ADR-009) with a **mock provider** default + Razorpay/PayU adapters later. `POST /payments/intent` (create gateway intent for an order), `POST /payments/webhook/:provider` (signature-verified; idempotent capture), COD path (no gateway, order confirmed on placement). Emits `payment.captured` → confirms order / triggers payout calc.

**Frontend.** Checkout payment step (method selection; redirect/tokenized flow for online, COD option). Order shows payment status. Admin payment/refund views.

**Migration strategy.** Fully additive tables. Ship behind the mock provider so the flow is testable without real gateway credentials; swap adapter via env later.

**Risks & mitigation.** *PCI scope* → tokenization / gateway redirect only; raw card data never transits the API; webhook signature verification (A08). *Double capture* → idempotency key on webhook + `Payment.status` guard. *SSRF via seller-supplied callback URLs* → allowlist, no arbitrary fetch.

---

### 3.6 🔴 Returns / RMA + gateway refunds

**Why required.** PRD requires customer-initiated returns within policy, seller/admin approval, pickup, inspect, refund-to-bank/wallet with SLAs.

**DB.** `ReturnRequest` (per `SubOrder`, `reason`, `status` `REQUESTED→APPROVED/REJECTED→ITEM_RECEIVED→REFUND_INITIATED→REFUND_COMPLETED`), 1:1 `Refund`.

**API.** Customer `POST /suborders/:id/returns`; seller/admin approve/reject; on `ITEM_RECEIVED` → `restock` (existing primitive) + `Refund` against `Payment`. Reuses the existing restock ledger op.

**Frontend.** Customer return UI from order detail; seller/admin return queues.

**Migration strategy.** Additive. Depends on §3.4 (SubOrder) + §3.5 (Payment).

**Risks & mitigation.** *Refund before payment capture* → guard on `Payment.status=CAPTURED`. *Restock-on-fraudulent-return* → require `ITEM_RECEIVED` before restock+refund.

---

### 3.7 🟠 Per-seller inventory

**Why required.** Each seller owns and adjusts only their own stock; the seller dashboard queries "my inventory."

**DB.** Add `sellerId String?` + `@@index([sellerId])` to `InventoryItem` (denormalized for dashboard queries without joining through `Product`). Keep `@@unique([productId])` under single-seller-per-product (becomes `[productId, sellerId]` only if multi-offer is later adopted).

**API.** `listStock`/`getStockItem`/`adjust` gain seller scoping (§3.3). The `requireItem` helper (`inventory.service.ts`) is the ownership injection point.

**Frontend.** Seller inventory pages (reuse admin inventory components, scoped).

**Migration strategy.** Backfill `sellerId` from `Product.sellerId` after §3.2.

**Risks & mitigation.** *IM vs seller roles* → `INVENTORY_MANAGER` remains a platform role (cross-seller); sellers see only their own. Document the split in ADR-008.

---

### 3.8 🔴 Search (FTS, autocomplete, facets) via provider interface

**Why required.** PRD wants Flipkart-class search: full-text, autocomplete, synonyms, faceted filters, search analytics, <3s for 90% of queries. DB `contains` does not scale or rank.

**DB.** Interim: Postgres GIN FTS index (`to_tsvector(name||' '||description)`, raw SQL `CONCURRENTLY`). Optional `Product.ratingAvg/ratingCount` denormalized for sort.

**API.** Extract a `ProductSearch` provider interface (ADR-009). Default impl = current Prisma query (+ GIN FTS); Elasticsearch adapter later, fed by `product.*` domain events. `GET /products/search` with facets + `GET /products/suggest` autocomplete.

**Frontend.** Storefront autocomplete + faceted filter UI (extends `CatalogFilters`).

**Migration strategy.** GIN index additive (raw SQL). Provider seam lets the engine swap without touching controllers.

**Risks & mitigation.** *Index/data drift* (when ES added) → rebuild from events; treat DB as source of truth. *FTS lock on large table* → `CREATE INDEX CONCURRENTLY`.

---

### 3.9 🔴 Reviews & ratings

**Why required.** PRD: reviews from **verified purchases**, average rating on product page — "crucial for trust."

**DB.** `Review` (per `product` + `author`, `rating 1–5` with CHECK constraint via raw SQL, `isVerified`, `helpfulCount`, soft-delete, `@@unique([productId,userId])`). Maintain `Product.ratingAvg/ratingCount` via an event on review publish.

**API.** `POST /products/:id/reviews` (verify the author has a `DELIVERED` SubOrder containing the product → `isVerified`), moderation endpoints, aggregate on product detail.

**Frontend.** Review form + list + average stars on product page; admin moderation queue.

**Migration strategy.** Additive. Verified-purchase check depends on §3.4.

**Risks & mitigation.** *Fake reviews* → verified-purchase gate. *AVG on hot path* → denormalized aggregate updated on publish.

---

### 3.10 🔴 Coupons / promotions

**Why required.** PRD: platform + seller coupons, percentage/flat/free-shipping, applied at checkout; the existing `discountTotal` is the slot for it.

**DB.** `Coupon` (`code @unique`, `discountType`, `discountValue`, `minOrderAmount?`, usage caps, `scope PLATFORM/SELLER`, `sellerId?`, validity window), `CouponUsage` (`@@unique([couponId,userId,orderId])`). `Order.couponId?`.

**API.** `POST /cart/coupon` validate + apply (feeds `discountTotal` in the pipeline — platform coupon on grand total, seller coupon on that seller's SubOrder). Seller-created coupons require admin approval.

**Frontend.** Coupon field in checkout; seller coupon management; admin approval.

**Migration strategy.** Additive. Wire into the per-seller totals pipeline (§3.4).

**Risks & mitigation.** *Over-redemption / races* → atomic usage increment + unique `CouponUsage`. *Stacking abuse* → one coupon per order (initially).

---

### 3.11 🔴 Logistics / shipment tracking + shipping rates

**Why required.** PRD: courier APIs, label generation, real-time tracking (SMS/push), weight/dim/zone-based shipping charges.

**DB.** `ShippingRate` (per seller), `Shipment` + `ShipmentEvent` (per SubOrder; carrier, tracking number/url, timeline). (Covered structurally in §3.4.)

**API.** `ShippingProvider` interface (ADR-009): mock default + courier adapters. Rate quote feeds the per-seller `shippingTotal`. Tracking webhooks append `ShipmentEvent`s; SHIPPED transition creates a `Shipment`.

**Frontend.** Shipping-method selection in checkout; tracking timeline on order detail; seller dispatch UI.

**Migration strategy.** Additive. Behind mock provider.

**Risks & mitigation.** *Webhook spoofing* → signature verification. *Rate accuracy* → snapshot quoted rate onto the SubOrder.

---

### 3.12 🔴 Seller payouts & commission

**Why required.** Sellers must be paid net of platform commission; admin needs financial reconciliation.

**DB.** `SellerPayout` (per SubOrder, `grossAmount`, `commission`, `netAmount`, `status`, `@@unique([subOrderId])`).

**API.** On SubOrder `DELIVERED` (or settlement window) + captured payment → compute commission (`Seller.commissionRate ?? platform default`) → create payout (`PayoutProvider` interface). Admin reconciliation views.

**Frontend.** Seller earnings dashboard; admin payout/commission reports.

**Migration strategy.** Additive. Depends on §3.4 + §3.5.

**Risks & mitigation.** *Duplicate payout* → `@@unique([subOrderId])`. *Commission errors* → snapshot the rate used onto the payout; audit-log every payout.

---

### 3.13 🔴 Customer management (admin)

**Why required.** PRD/CLAUDE.md: admin views of customer profiles, order history, spending, activity. `customers` module is an empty stub.

**DB.** None (reuses `User`/`Order` relations); possibly a `spending` aggregate view.

**API.** `GET /admin/customers` (paginated), `GET /admin/customers/:id` (profile + order history + spend). Admin-only.

**Frontend.** Admin customer list + detail.

**Migration strategy.** Pure additive read endpoints.

**Risks & mitigation.** *PII exposure* → admin-only; audit-log access if required.

---

### 3.14 🔴 Analytics dashboards & reports

**Why required.** PRD: revenue, AOV, conversion, best sellers, category performance, inventory valuation, new-vs-returning, exportable reports. `analytics` module is an empty stub; admin Dashboard shows honest placeholders.

**DB.** Read-mostly aggregations via queries / materialized views (CLAUDE.md: "not hot-path recomputation"). Candidate matviews: daily revenue, best sellers, inventory valuation.

**API.** `GET /admin/analytics/*` (sales/inventory/products/customers); seller-scoped `GET /seller/analytics/*`; CSV export. Admin + seller-scoped.

**Frontend.** Admin analytics dashboard (replace placeholders); seller analytics.

**Migration strategy.** Additive. Matviews + refresh job.

**Risks & mitigation.** *Stale matviews* → scheduled refresh + "as of" labeling. *Heavy queries* → indexes + matviews, never recompute on render.

---

### 3.15 🟡 Notifications via domain events (fire + consume)

**Why required.** PRD/CLAUDE.md: notifications fire on domain events (registration/order/shipping/delivery for customers; new-order/low-stock/refund for admin/seller) and are displayed. Today only `LOW_STOCK` is wired.

**DB.** `NotificationType` enum already has the customer/admin values; add seller/marketplace values (`SELLER_KYC_APPROVED`, `PAYOUT_*`, `RETURN_*`, `NEW_REVIEW`, etc.).

**API.** Emit domain events at their sources (placement, status change, payment, KYC, payout) following the existing deferred-emit-after-commit pattern. Listeners persist `Notification` rows + dispatch email/SMS via a `NotificationChannel` provider (mock default). `GET /notifications` + mark-read.

**Frontend.** Notification feed/badge in storefront + admin/seller.

**Migration strategy.** Additive enum values (own migration). Generalize the `LowStockListener` pattern.

**Risks & mitigation.** *Emit on rollback* → reuse the post-commit emit pattern already proven. *Channel failures* → log (don't swallow), retry/queue later.

---

### 3.16 🟠 Audit logging (activate the existing model)

**Why required.** PRD security + CLAUDE.md mandate auditing sensitive mutations; the `AuditLog` table exists but is never written.

**DB.** None (model exists). New string values for `entityType`/`action`.

**API.** A thin `AuditService` wrapping `prisma.auditLog.create`, injected into order status/refund, inventory adjust, seller KYC, payments/payouts. Write inside the mutation's transaction (or fire-and-forget) with `actorId`.

**Frontend.** Optional admin audit viewer.

**Migration strategy.** Pure additive service.

**Risks & mitigation.** *Audit gaps* → centralize via the service + a convention/checklist per sensitive mutation. *Performance* → in-transaction is fine at this scale; can move to event-driven later.

---

### 3.17 🔴 Platform hardening (rate limit, helmet, caching, CMS, observability, CI/CD)

**Why required.** PRD NFRs: security (rate limiting, headers, CORS), performance (caching/CDN), reliability (monitoring/logging/alerts, backups/DR), CMS for static pages/banners.

**DB.** `ContentPage` (CMS: slug, title, body, status, publishedAt).

**API.** `@nestjs/throttler` (tight on auth routes), `helmet`, env-driven CORS, Redis cache provider (interface), global logging/metrics interceptor + exception filter, health checks, CMS CRUD.

**Frontend.** Storefront renders CMS pages/banners; admin CMS editor.

**Migration strategy.** Mostly app-config + additive. CMS table additive.

**Risks & mitigation.** *Premature distribution* → keep monolith; introduce broker/ES/Redis behind interfaces only when load demands (ADR-002/009). *Cache invalidation* → event-driven busting tied to `product.*` events.

---

## 4. What Stays Untouched (Preserve)

These are correct and must survive: money as `Decimal(12,2)`; `cuid()` PKs; `@@index` on every FK + sort column; soft deletes with `[deletedAt, createdAt]`; append-only inventory ledger; order/totals **snapshots**; the pure totals pipeline; the pure order state machine; global `ValidationPipe`; the global guard chain; the deferred-emit-after-commit event pattern; per-app `DESIGN.md` tokens; the storefront httpOnly-cookie session model.

---

## 5. Net Assessment

| Bucket | Count (features) | Effort character |
|---|---|---|
| ✅ Fully Implemented | ~14 | Preserve; reuse as building blocks. |
| 🟡 Partial | ~9 | Extend existing foundations (search, multi-step checkout, events, NFRs). |
| 🟠 Needs Refactor | ~7 | Reshape single-vendor assumptions (product ownership, order split, totals, inventory, audit, CORS). |
| 🔴 Missing | ~20 | Net-new (seller, payments, returns, reviews, coupons, logistics, payouts, analytics, customers, CMS, notifications UX). |

**Critical path** runs through identity and order topology: **SELLER + seller-scoping → product/inventory ownership → SubOrder split → payments**. Almost everything else (reviews, coupons, search, analytics, notifications, logistics) is additive and parallelizable once that spine exists — quantified in `PARALLEL_EXECUTION_PLAN.md`. The single intentional breaking change (SKU composite-unique) is contained and sequenced in `MIGRATION_PLAN.md`.
