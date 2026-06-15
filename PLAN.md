# PLAN.md — Implementation Roadmap

Phased build plan for the E-Commerce Portal, derived from `docs/E-Commerce Portal PRD.pdf`. Stack and architecture: see root `CLAUDE.md`. Design tokens: `DESIGN.md`.

**Apps:** `apps/storefront` (Next.js), `apps/admin` (React+Vite), `apps/api` (NestJS+Prisma).

Phases are ordered by dependency: the API and data model come first because both frontends depend on them; storefront and admin then build in parallel on top.

---

## Progress Tracker

This is the live source of truth for task status. **Keep it updated** as work happens: flip a checkbox to `[x]` when a task is done, and update the status table below. Status legend: ⬜ Not Started · 🟡 In Progress · ✅ Done.

> **Workflow rule:** complete **one feature at a time**. After finishing any single feature, **stop and ask for verification** before starting the next. Do not batch multiple features in one go. (Mirrored in root `CLAUDE.md`.)

### App status

| App | Scaffolded | Status |
|-----|-----------|--------|
| `apps/api` (NestJS+Prisma) | ✅ | Scaffolded (Prisma pending — Phase 1) |
| `apps/storefront` (Next.js) | ✅ | Scaffolded (Tailwind v4 + tokens) |
| `apps/admin` (React+Vite) | ✅ | Scaffolded (Tailwind v4 + tokens) |

### Phase status

| Phase | Title | Status |
|-------|-------|--------|
| 0 | Foundation | 🟡 In Progress (apps scaffold ✅; Prisma + FE test runners pending) |
| 1 | Data model & core domain (API) | ⬜ Not Started |
| 2 | Authentication & authorization | ⬜ Not Started |
| 3 | Product catalog | ⬜ Not Started |
| 4 | Cart & checkout | ⬜ Not Started |
| 5 | Orders & inventory | ⬜ Not Started |
| 6 | Customers, analytics, notifications | ⬜ Not Started |
| 7 | Non-functional hardening | ⬜ Not Started |

**Current focus:** Phase 0 nearly complete — three apps scaffolded, build & lint green, API on Jest (17 tests). Remaining before Phase 1: Prisma/Postgres setup (folds into Phase 1) and frontend test runners (Vitest+RTL / Playwright). Awaiting user verification.

---

## Phase 0 — Foundation

- [x] `git init` + root `.gitignore` (node_modules, .env*, .next, dist, build).
- [x] Scaffold `apps/api` (NestJS CLI), `apps/storefront` (create-next-app, TS/App Router/Tailwind), `apps/admin` (Vite react-ts + Tailwind).
- [x] Wire `DESIGN.md` color/type/spacing tokens into both frontends' Tailwind themes (shared values via `packages/design-tokens/theme.css`, Tailwind v4 `@theme`).
- [ ] Set up Prisma + PostgreSQL connection; base ESLint/Prettier/tsconfig across apps. *(Prisma deferred to Phase 1; ESLint present per app.)*
- [ ] Set up test runners per app — Jest in `api` ✅ (17 tests passing); Vitest + RTL for `admin`/`storefront` and Playwright for storefront E2E still **pending**.
- [x] Verify each app builds and lints clean. **Exit criteria:** all three build ✅; lint clean ✅; `apps/api` `npm test` works ✅. FE test runners pending.

> **Build everything test-first (TDD).** Use the project TDD plugin (`.claude/` — `tdd` skill, `/tdd` command, `tdd-runner` agent). Red → green → refactor; 80% coverage target. See `RULE.md` §4.

## Phase 1 — Data model & core domain (API)

- [ ] Prisma schema: `User`/role, `Product`, `Category` (self-referential hierarchy), `Cart`/`CartItem`, `Order`/`OrderItem`, `InventoryMovement`, `Address`, `Notification`, `AuditLog`.
- [ ] Encode order-status enum and inventory available/reserved fields.
- [ ] Initial migration + seed script (sample categories/products).
- [ ] Module skeletons: `auth`, `products`, `categories`, `cart`, `orders`, `inventory`, `customers`, `analytics`, `notifications`.
- [ ] **Exit:** schema migrated, modules wired, health check green.

## Phase 2 — Authentication & authorization (API + both frontends)

- [ ] API: customer register/login/logout/password-reset/profile; admin secure login; session/JWT; role-based guards (Customer / Admin / Inventory Manager).
- [ ] Storefront: auth pages + session handling + protected customer routes.
- [ ] Admin: login + role-gated app shell (redirect UX only; API enforces).
- [ ] **Exit:** each role can log in and only reach permitted endpoints.

## Phase 3 — Product catalog

- [ ] API: product CRUD (create/update/archive/activate-deactivate) with all PRD fields; category CRUD + hierarchy; search/filter/sort; pagination + indexes.
- [ ] Storefront: SSR catalog, category browse, search/filter/sort, product detail (images, pricing, availability, related).
- [ ] Admin: product management UI, category management (hierarchical).
- [ ] **Exit:** products manageable in admin, discoverable in storefront.

## Phase 4 — Cart & checkout

- [ ] API: server-authoritative cart + the `subtotal → discounts → taxes → shipping → grand total` pipeline; persist cart state.
- [ ] Storefront: cart (add/remove/update/totals), checkout (shipping info → order review → place order). **No payment** — order is created on confirm.
- [ ] **Exit:** customer can build a cart and place an order; totals match between cart and review.

## Phase 5 — Orders & inventory

- [ ] API: order lifecycle + state-machine transition guards; stock reserve on placement, deduct on fulfillment, release on cancel; inventory movements ledger; adjustments; low-stock threshold alerts; refunds.
- [ ] Storefront: order history, order details, status tracking.
- [ ] Admin: order management (view, update status, refunds, history); inventory management (stock, reports, adjustments, available vs reserved).
- [ ] **Exit:** end-to-end order flow with correct stock accounting and valid status transitions.

## Phase 6 — Customers, analytics, notifications

- [ ] API: customer management (view, order history, activity, spending); analytics aggregations (sales, inventory, products, customers); domain-event notifications.
- [ ] Admin: customer views + analytics dashboard.
- [ ] Storefront + Admin: consume notifications (customer: registration/order/shipping/delivery; admin: new orders, low-stock, refund requests).
- [ ] **Exit:** dashboards populated; notifications fire on events.

## Phase 7 — Non-functional hardening

- [ ] Performance: optimize API responses, caching, pagination review.
- [ ] Security: input validation everywhere, protected admin access, audit logging of sensitive actions.
- [ ] Reliability: error handling, monitoring, logging, recovery.
- [ ] Accessibility: WCAG audit (keyboard nav, screen readers, contrast per `DESIGN.md`).
- [ ] **Exit:** non-functional requirements from the PRD met as acceptance criteria.

---

## Out of scope (PRD Future Enhancements — do not build unless asked)

Payment gateways, product reviews, wishlist, coupons, promotions, loyalty program, recommendations, multi-warehouse inventory, multi-vendor marketplace, AI-powered search.
