# ARCHITECTURE_DECISIONS.md — ADR Log

> **Status:** Architecture document. Each ADR records a decision, its context, the alternatives weighed, and consequences. These govern the marketplace evolution and are referenced by `GAP_ANALYSIS.md`, `DOMAIN_MODEL.md`, `MIGRATION_PLAN.md`, and `IMPLEMENTATION_PLAN.md`.
>
> Format: lightweight ADR. Status ∈ {Accepted, Proposed}. Date: 2026-06-19 unless noted.

---

## Index

| ADR | Title | Status |
|---|---|---|
| 001 | Evolve in place (no rewrite) | Accepted |
| 002 | Modular monolith now; microservice-ready seams | Accepted |
| 003 | Event-driven domain integration | Accepted |
| 004 | Seller portal inside the existing admin app | Accepted |
| 005 | Add `SELLER` role; reuse the existing RBAC chain | Accepted |
| 006 | Order → SubOrder → Shipment topology | Accepted |
| 007 | Single-seller-per-product (defer multi-offer) | Accepted |
| 008 | Service-layer ownership scoping (not guards) for multi-tenancy | Accepted |
| 009 | Provider interfaces for payment / search / shipping / notification / cache | Accepted |
| 010 | Mock external providers by default; swap by env | Accepted |
| 011 | Postgres FTS first; Elasticsearch behind the search provider | Accepted |
| 012 | Activate `AuditLog` via an `AuditService` | Accepted |
| 013 | PCI-DSS: tokenization / redirect; never store card data | Accepted |
| 014 | Keep totals + state machine pure; run per-seller | Accepted |
| 015 | Each phase independently deployable; expand/contract migrations | Accepted |
| 016 | Security hardening: throttler, helmet, env CORS, MFA-optional | Accepted |
| 017 | Storefront httpOnly cookies kept; admin/seller cookie migration | Proposed |

---

## ADR-001 — Evolve in place (no rewrite)

**Context.** Phases 0–5 are complete, tested (~368 tests), and smoke-verified: auth, catalog, cart, totals pipeline, checkout, order state machine, inventory ledger. The PRD is a marketplace superset, not a contradiction. Three core pieces (totals pipeline, order state machine, inventory ledger) are already pure/isolated and reusable.

**Decision.** Evolve the existing codebase additively. Treat the marketplace as new domain *added to* and seams *reshaped within* the current monolith. Avoid breaking changes unless absolutely necessary.

**Alternatives.**
- *Greenfield rebuild* — cleaner target but discards working, tested code and restarts the verification cost; rejected.
- *Strangler/parallel services* — closest to the PRD's microservice prose but heaviest process overhead for a demo platform; premature (see ADR-002).

**Consequences.** Faster, lower-risk delivery; reuse of proven domain logic. Cost: we accept one intentional breaking change (ADR-007 SKU constraint) and a deprecation window on `OrderItem`. Migrations are additive/backfill-first (ADR-015, `MIGRATION_PLAN.md`).

---

## ADR-002 — Modular monolith now; microservice-ready seams

**Context.** The PRD names microservices, Kafka, Kubernetes. The current app is a NestJS modular monolith with clean module boundaries (each PRD domain ≈ one module). Premature distribution adds operational cost without demand.

**Decision.** Stay a modular monolith. Enforce bounded-context boundaries (`DOMAIN_MODEL.md §1`): a context owns its tables; cross-context **reads** go through an injected service interface; cross-context **writes/side-effects** go through domain events (ADR-003). This makes each module extractable to a service later with minimal change.

**Alternatives.**
- *Build microservices now* — maximal PRD fidelity, large infra/ops scope, slower iteration; rejected for a demo.
- *Big-ball-of-mud monolith* — no boundaries; rejected (defeats future extraction).

**Consequences.** One deployable, simple ops, fast dev. Extraction path is real because boundaries + event contracts are explicit. We must be disciplined: no reaching into another context's tables directly.

---

## ADR-003 — Event-driven domain integration

**Context.** `@nestjs/event-emitter` is already wired (`EventEmitterModule.forRoot()`); only `inventory.low-stock` uses it. Orders→inventory is a *direct service call*. The PRD wants decoupled domain events; the marketplace fans out (payment, payout, notification, analytics, search index) from a few core events.

**Decision.** Standardize on domain events for cross-context side-effects, using the existing **deferred-emit-after-commit** pattern (collect during the transaction, emit after commit — proven by low-stock). Define the event catalog (`DOMAIN_MODEL.md §6`). Keep tightly-coupled, same-transaction operations (order placement reserving stock) as direct calls inside the transaction; use events for everything that can be async/eventually-consistent.

**Alternatives.**
- *All direct service calls* — simple but couples contexts and blocks extraction; rejected.
- *Event-source everything immediately* — over-engineered for current scale; rejected.

**Consequences.** Loose coupling, easy to add consumers (notifications, analytics, search indexing) without touching producers. Must guard against emit-on-rollback (pattern already exists) and document event contracts as the integration API.

---

## ADR-004 — Seller portal inside the existing admin app

**Context.** Sellers need a portal (dashboard, product/inventory/order/promo management, analytics, payouts). The admin app (React + Vite SPA) already has auth, an `apiClient` with refresh, role-gated routing (`ProtectedRoute`/`AdminOnlyRoute`), reusable tables/pagination/forms, and shared DESIGN tokens.

**Decision.** Serve the seller portal as a **role-scoped area of the existing admin app** under the new `SELLER` role, in a separate route group with a seller-scoped shell. `INVENTORY_MANAGER` stays a platform-side role (cross-seller). No new app scaffolded.

**Alternatives.**
- *New dedicated `apps/seller` app* — closest to Flipkart's separate seller portal but duplicates auth/apiClient/build infra and shared components; deferrable.
- *Seller features in storefront* — wrong audience and rendering model (SSR/SEO vs internal SPA); rejected.

**Consequences.** Reuse of auth/client/components; one fewer app to build/deploy. Cost: the admin app must cleanly separate admin vs seller route groups and scope navigation by role. If seller scale/branding later demands its own app, the seller route group is already a clean extraction unit.

---

## ADR-005 — Add `SELLER` role; reuse the existing RBAC chain

**Context.** Global `JwtAuthGuard` + `RolesGuard` (`APP_GUARD`) already support any role via `@Roles(...)`. Role is a JWT claim; `JwtStrategy.validate` re-checks the user is active each request. `register` hardcodes `CUSTOMER`.

**Decision.** Add `SELLER` to the `Role` enum. Reuse the guard chain unchanged. Seller registration goes through a dedicated `POST /seller/register` (not the customer path). Seller *approval/active* state is **DB-authoritative** (`Seller.status`), checked by a `SellerApprovedGuard` for sensitive seller mutations — because the JWT role claim can be up to 15m stale.

**Alternatives.**
- *Seller as a flag on CUSTOMER* — muddies guards and route scoping; rejected (still want the enum value).
- *Separate seller auth system* — duplicates JWT/refresh; rejected.

**Consequences.** Minimal auth change. Role-level checks via `@Roles(SELLER)`; resource-level via ADR-008. The 15-minute role-claim staleness is accepted and documented; status-sensitive actions are DB-gated.

---

## ADR-006 — Order → SubOrder → Shipment topology

**Context.** A buyer's basket spans multiple sellers; each seller must confirm/ship/track/refund/be-paid independently, but the buyer pays once and sees one order. The current single `Order.status` cannot model independent fulfillment lifecycles.

**Decision.** Three-level aggregate (`DOMAIN_MODEL.md §2`): `Order` (buyer aggregate, cross-seller grand total, single payment, **rollup status**) → `SubOrder` (seller aggregate, own status state machine, own per-seller totals, own shipping snapshot) → `SubOrderItem`; `Shipment`/`ShipmentEvent` per SubOrder. The existing pure state machine drives `SubOrder.status`; `Order.status` is recomputed in the same transaction (`rollupOrderStatus`).

**Alternatives.**
- *Separate independent orders per seller* — loses the single-payment/single-checkout buyer experience and cross-seller order id; rejected.
- *One order, per-item status* — explodes status logic across items, no clean seller unit for payout/shipping; rejected.
- *`Order.status` as DB generated column* — Postgres generated columns can't reference child tables; rejected.

**Consequences.** Clean seller fulfillment unit; payouts/shipments/returns attach naturally to `SubOrder`. Cost: backfill existing orders into one platform-seller SubOrder each; keep `OrderItem` during the deprecation window; rollup must stay transactional to avoid drift.

---

## ADR-007 — Single-seller-per-product (defer multi-offer)

**Context.** Two models: (a) **single-seller-per-product** — each product row has one seller; "same" item from two sellers = two rows (Flipkart catalog-ish); (b) **multi-offer** — one catalog `Product` + per-seller `Offer`/`Listing` rows (Amazon-ish). Current schema implies (a): `Product.sku @unique`, `InventoryItem.productId @unique`.

**Decision.** Adopt single-seller-per-product now. Add `Product.sellerId`; relax `sku` to `@@unique([sku, sellerId])` (each seller owns its SKU namespace). `InventoryItem.productId @unique` stays valid. Defer multi-offer until catalog dedup is a real requirement.

**Alternatives.**
- *Multi-offer now* — richer buyer comparison but requires a `Listing` model, breaks `InventoryItem.productId @unique`, and complicates pricing/inventory immediately; rejected as premature.

**Consequences.** Minimal schema change; reuses existing 1:1 product↔inventory. Cost: catalog fragmentation (same item appears multiple times) — acceptable for the demo. Promotion path to multi-offer is documented (introduce `Listing`, move price/inventory onto it, change two unique constraints together).

---

## ADR-008 — Service-layer ownership scoping (not guards) for multi-tenancy

**Context.** Adding `SELLER` to existing `@Roles(...)` decorators on products/inventory without ownership filters creates cross-tenant leaks (Seller A reads/writes Seller B's data). Guards run before the handler and don't have the resolved resource id; interceptors run after the fetch and would require post-filtering (leaks counts/ids).

**Decision.** Enforce resource ownership in the **service layer** as a `WHERE` predicate, mirroring the existing customer-order pattern (`orders.service.ts:375`). Rule: `if (actor.role === SELLER) where.sellerId = actor.sub` (admin bypasses). Mismatched owner → `NotFoundException` (information hiding). Guards remain for **role-level** checks only (`@Roles`, `SellerApprovedGuard`).

**Alternatives.**
- *Ownership in guards* — can't see the resource; rejected.
- *Ownership in an interceptor (post-filter)* — over-fetches, leaks pagination totals; rejected.
- *Row-level security in Postgres* — powerful but couples app identity to DB sessions and complicates the ORM; deferred.

**Consequences.** Consistent, testable isolation; `count` is also scoped (no pagination leak). Cost: discipline — every seller-reachable service method must apply the scope; covered by review + tests. `INVENTORY_MANAGER` remains cross-seller (platform role); sellers see only their own.

---

## ADR-009 — Provider interfaces for payment / search / shipping / notification / cache

**Context.** The PRD names concrete vendors (Razorpay/PayU, Elasticsearch, courier APIs, Redis). Binding directly to them couples the domain to externalities and blocks testing without credentials.

**Decision.** Define a NestJS injection-token interface per external concern: `PaymentProvider`, `ProductSearch`, `ShippingProvider`, `NotificationChannel`, `CacheProvider`. Domain services depend on the interface, never the vendor SDK. Vendor adapters implement the interface and are bound by module config.

**Alternatives.**
- *Direct SDK calls in services* — fast to write, untestable, vendor-locked; rejected.

**Consequences.** Testable (inject fakes), swappable (env-selected adapter, ADR-010), and the clean seam for microservice extraction. Cost: one interface + a default impl per concern up front.

---

## ADR-010 — Mock external providers by default; swap by env

**Context.** A demo platform shouldn't require live payment/courier credentials to run or test. The RULE.md requires smoke-running real flows.

**Decision.** Ship a **mock/in-memory implementation** of every provider (ADR-009) as the default binding. Real adapters (Razorpay/PayU, ES, courier) are selected via env (`PAYMENT_PROVIDER=mock|razorpay`, etc.). Mocks are deterministic and exercise the full domain flow (capture, webhook, tracking events) without external calls.

**Alternatives.**
- *Sandbox-only (real vendor sandboxes)* — still needs credentials/network, flaky in CI; rejected as the default.

**Consequences.** Every phase is independently runnable and smoke-testable (ADR-015). Real integrations become a config + adapter task, not a redesign. Cost: maintain mock fidelity to the contract.

---

## ADR-011 — Postgres FTS first; Elasticsearch behind the search provider

**Context.** Search today is Prisma `contains` OR. The PRD wants FTS, autocomplete, facets, <3s p90. Standing up Elasticsearch immediately is heavy.

**Decision.** Implement the `ProductSearch` interface (ADR-009) with a **Postgres GIN full-text** default (raw-SQL `CONCURRENTLY` index on `to_tsvector(name||' '||description)`), plus facets via indexed columns. Add an Elasticsearch adapter later, fed by `product.*` events, swapped by env (ADR-010), with Postgres remaining source of truth.

**Alternatives.**
- *Elasticsearch from day one* — best search, large infra/sync cost; deferred.
- *Stay on `contains`* — fails ranking/scale/p90; rejected.

**Consequences.** Real improvement (ranking + autocomplete) without new infra; clean upgrade path. Cost: FTS index maintenance; ES sync via events when adopted.

---

## ADR-012 — Activate `AuditLog` via an `AuditService`

**Context.** The `AuditLog` model exists but is **never written** (confirmed: zero `prisma.auditLog.create` calls). PRD + CLAUDE.md mandate auditing sensitive mutations.

**Decision.** Implement a thin injectable `AuditService` wrapping `prisma.auditLog.create({actorId, action, entityType, entityId, metadata})`. Inject into every sensitive mutation: order/suborder status, refund, stock adjustment, seller KYC approval, payout, coupon approval, role change. Write in-transaction with the mutation where atomicity matters; fire-and-forget otherwise.

**Alternatives.**
- *Global interceptor auto-audit* — captures requests but lacks domain semantics (what entity/why); use as a complement, not the primary; deferred.
- *Leave unaudited* — violates PRD/CLAUDE.md; rejected.

**Consequences.** Compliance + traceability for the marketplace's money/role-sensitive actions. Cost: a per-mutation convention (checklist in reviews/tests).

---

## ADR-013 — PCI-DSS: tokenization / redirect; never store card data

**Context.** Payments are new. PCI-DSS scope balloons if raw card data touches our systems.

**Decision.** Use gateway-side **tokenization or redirect/3DS** flows; card PAN/CVV/expiry never transit the API, never appear in the schema, never in logs. The API stores only `gatewayRef`, `status`, `amount`, `method`, and raw webhook payload (for audit) on `Payment`/`Transaction`. Webhooks are **signature-verified** and **idempotent**.

**Alternatives.**
- *Collect card data server-side* — maximal PCI scope/liability; rejected outright.

**Consequences.** Minimal PCI scope. Constrains the payment UX to redirect/tokenized flows (acceptable, matches Razorpay/PayU norms). Enforced as an invariant (`DOMAIN_MODEL.md §7.5`).

---

## ADR-014 — Keep totals + state machine pure; run per-seller

**Context.** `computeTotals`/`priceItems` and `order-status.ts` are pure, isolated, and the single source of truth for money and transitions.

**Decision.** Preserve their purity. The totals pipeline runs **once per seller group** and aggregates (`DOMAIN_MODEL.md §5`); the state machine drives `SubOrder.status`. Both cart preview and order review call the same totals function so numbers never diverge (existing invariant).

**Alternatives.**
- *Inline per-seller math in services* — duplicates the authority, invites drift; rejected.

**Consequences.** Totals parity and transition correctness are preserved by construction; per-seller behavior is config-driven (tax rate, shipping quote, coupon scope). Easy to unit-test in isolation.

---

## ADR-015 — Each phase independently deployable; expand/contract migrations

**Context.** RULE.md mandates one verifiable slice at a time, smoke-run before "done." The user requires every phase to be independently deployable.

**Decision.** Every phase ships behind additive, backward-compatible migrations using **expand → backfill → contract**: add nullable columns/tables, deploy code that writes them, backfill, then (later, separate migration) tighten constraints/drop deprecated columns. Feature-flag or default-mock incomplete external integrations (ADR-010) so a half-built phase never breaks the running app. Enum `ADD VALUE` lives in its own non-transactional migration.

**Alternatives.**
- *Big-bang migrations* — couples deploys, risks downtime/rollback pain; rejected.

**Consequences.** Safe, reversible, zero-downtime deploys; phases can interleave (`PARALLEL_EXECUTION_PLAN.md`). Cost: the one breaking change (ADR-007) is explicitly sequenced and paired with its call-site fixes.

---

## ADR-016 — Security hardening: throttler, helmet, env CORS, MFA-optional

**Context.** Gaps found: no rate limiting (login/register/reset exposed), no security headers, hardcoded CORS, no MFA, `localStorage` admin tokens, TOCTOU on reset confirm, no refresh-family invalidation.

**Decision.** Add `@nestjs/throttler` (tight limits on auth routes), `helmet`, env-driven CORS (no wildcards). Make the reset-confirm atomic (`UPDATE … WHERE usedAt IS NULL RETURNING`). Add optional admin TOTP MFA (`mfaEnabled`/`mfaSecret` on `User`, challenge between credential check and token issue) — additive, no guard change. Add refresh-token family invalidation on detected reuse.

**Alternatives.**
- *Defer all hardening to the end* — leaves money/role-sensitive marketplace routes exposed during build; partially rejected — land throttler/helmet/CORS early, MFA optional/later.

**Consequences.** Closes OWASP gaps surfaced in the security map. Cost: small, mostly app-config; MFA is opt-in.

---

## ADR-017 — Storefront httpOnly cookies kept; admin/seller cookie migration (Proposed)

**Context.** Storefront uses httpOnly cookies (XSS-safe); admin uses `localStorage` + Bearer (known XSS-exfiltration tradeoff, flagged in `PLAN.md`). The seller portal will live in the admin app and handle money-sensitive actions (payouts), raising the stakes of the `localStorage` choice.

**Decision (Proposed).** Keep the storefront cookie model. Plan to migrate the admin/seller app to API-set httpOnly cookies (same pattern as storefront route handlers) during NFR hardening, before sellers manage real payouts. Until then, the admin app stays internal-only (`:5002`) to limit attack surface.

**Alternatives.**
- *Leave admin on localStorage* — simplest, but elevated risk once sellers + payouts are involved; deferred-not-dismissed.

**Consequences.** Consistent XSS posture across surfaces eventually. Marked **Proposed** because it touches the admin auth plumbing and should be scheduled deliberately (NFR phase), not bundled into a feature slice.
