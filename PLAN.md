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
| `apps/api` (NestJS+Prisma) | ✅ | Prisma 7 wired; schema migrated; 9 modules; boots OK |
| `apps/storefront` (Next.js) | ✅ | Scaffolded (Tailwind v4 + tokens); Vitest+RTL + Playwright wired |
| `apps/admin` (React+Vite) | ✅ | Scaffolded (Tailwind v4 + tokens); Vitest+RTL wired |

### Phase status

| Phase | Title | Status |
|-------|-------|--------|
| 0 | Foundation | ✅ Done (apps scaffold ✅; Prisma ✅; test runners — Jest/Vitest/Playwright ✅) |
| 1 | Data model & core domain (API) | ✅ Done |
| 2 | Authentication & authorization | 🟡 In Progress (API auth ✅; storefront 🟡; admin pending) |
| 3 | Product catalog | ⬜ Not Started |
| 4 | Cart & checkout | ⬜ Not Started |
| 5 | Orders & inventory | ⬜ Not Started |
| 6 | Customers, analytics, notifications | ⬜ Not Started |
| 7 | Non-functional hardening | ⬜ Not Started |

**Current focus:** Phase 2 storefront auth ✅ — login/register/logout + protected `/account`, httpOnly-cookie session via Next route handlers proxying the API; smoke-verified end-to-end against `ecom_dev`. Next (stop & verify first): storefront **password-reset** UI (request + confirm pages), then **admin** login + role-gated shell.

---

## Project State & Gotchas (read before resuming)

Environment facts and hard-won lessons not derivable from the code. A fresh session loads `CLAUDE.md` (+ imports) and this file automatically — this note carries what those don't.

**Local database (dev):**
- Use Postgres DB **`ecom_dev`** (migrations shadow DB: **`ecom_shadow`**). Connect as local user `sotsys033`, **no password**.
- ⚠️ A pre-existing **`ecomm`** database exists on the same server and is **NOT part of this project** (different owner role, unrelated tables). **Never migrate, seed, drop, or point Prisma at it.**
- Connection strings live in `apps/api/.env` (gitignored); template in `apps/api/.env.example`.

**Prisma 7 (≠ v5/v6 — see the `prisma-patterns` skill, now updated for v7):**
- Connection URLs are in `apps/api/prisma.config.ts`, **not** `schema.prisma`.
- `PrismaClient` **requires a driver adapter** (`@prisma/adapter-pg`); `PrismaService` is already wired this way.
- `prisma db seed` reads `migrations.seed` from `prisma.config.ts`; seed file loads its own `dotenv`.

**Build / run:**
- NestJS compiled entry is **`dist/src/main.js`** (the `prisma/` dir widened rootDir). Use `npm run start:dev` / `start:prod`; don't hardcode `dist/main.js`.
- Shell cwd resets between tool calls — use absolute paths or `npm --prefix`.

**Conventions in play:**
- Code `OrderStatus` enum values are UPPERCASE to match the Prisma DB enum (`apps/api/src/orders/order-status.ts`).
- TDD is enforced via the `.claude/` plugin; one feature at a time, stop and verify (see `RULE.md`).

**Storefront auth (Phase 2, 2026-06-15):** Session lives in **httpOnly cookies** `sf_access`/`sf_refresh` set by Next **Route Handlers** under `src/app/api/auth/*` (browser never sees tokens; handlers call the API server-to-server). `src/lib/session.ts` reads cookies and **refreshes on access-token 401**; pure `resolveSession()` is unit-tested via injected deps. `src/proxy.ts` (Next 16 renamed `middleware`→`proxy`; default export must be named `proxy`) guards `/account` on cookie presence; the page re-verifies via `getCurrentUser()`. **Fixed dev ports** (so the three apps never collide): **api `:5000`**, **storefront `:5001`**, **admin `:5002`**. API port via `PORT` in `apps/api/.env` (read in `main.ts`); storefront via `next dev/start -p 5001` + Playwright `baseURL`/`webServer` on `:5001`; admin via `server.port`/`preview.port` (`strictPort`) in `vite.config.ts`. Storefront→API base URL is **`API_URL=http://localhost:5000`** (`.env.local`, gitignored; template `.env.example`). Vitest can't resolve `server-only`/`next/headers`, so `vitest.config.ts` **aliases** both to stubs in `src/test/`.

**Phase 0 test runners (closed 2026-06-15):** frontend test runners are now wired — Vitest + RTL in `admin` and `storefront`, Playwright E2E in `storefront` (each with a passing smoke test). Unit tests are co-located `*.test.tsx`; storefront E2E lives in `apps/storefront/e2e/*.spec.ts` (Vitest excludes `e2e/**`, so the two runners never overlap). Note: storefront's `next.config.ts` sets `turbopack.root` to the repo root so `globals.css` can import the shared `packages/design-tokens/theme.css` without Turbopack rejecting the `../` traversal.

---

## Phase 0 — Foundation

- [x] `git init` + root `.gitignore` (node_modules, .env*, .next, dist, build).
- [x] Scaffold `apps/api` (NestJS CLI), `apps/storefront` (create-next-app, TS/App Router/Tailwind), `apps/admin` (Vite react-ts + Tailwind).
- [x] Wire `DESIGN.md` color/type/spacing tokens into both frontends' Tailwind themes (shared values via `packages/design-tokens/theme.css`, Tailwind v4 `@theme`).
- [ ] Set up Prisma + PostgreSQL connection; base ESLint/Prettier/tsconfig across apps. *(Prisma deferred to Phase 1; ESLint present per app.)*
- [x] Set up test runners per app — Jest in `api` ✅; Vitest + RTL in `admin` ✅ and `storefront` ✅; Playwright E2E in `storefront` ✅ (each proven by a smoke test).
- [x] Verify each app builds and lints clean. **Exit criteria:** all three build ✅; lint clean ✅; `apps/api` `npm test` works ✅. FE test runners pending.

> **Build everything test-first (TDD).** Use the project TDD plugin (`.claude/` — `tdd` skill, `/tdd` command, `tdd-runner` agent). Red → green → refactor; 80% coverage target. See `RULE.md` §4.

## Phase 1 — Data model & core domain (API)

- [x] Prisma schema: `User`/role, `Product`, `Category` (self-referential hierarchy), `Cart`/`CartItem`, `Order`/`OrderItem`, `InventoryItem`, `InventoryMovement`, `ProductImage`, `Address`, `Notification`, `AuditLog`.
- [x] Encode order-status enum and inventory available/reserved fields. (Code `OrderStatus` enum values aligned to Prisma enum.)
- [x] Initial migration (`init`) applied to `ecom_dev` + idempotent seed script (categories + products + inventory).
- [x] Module skeletons: `auth`, `products`, `categories`, `cart`, `orders`, `inventory`, `customers`, `analytics`, `notifications` — all wired into `AppModule`.
- [x] **Exit:** schema migrated ✅, modules wired ✅, app boots & serves HTTP 200 with Prisma connected ✅.

> Prisma 7 notes: connection URLs live in `prisma.config.ts` (not schema); `PrismaClient` requires a driver adapter (`@prisma/adapter-pg`). Env loaded via `@nestjs/config`. DBs: `ecom_dev` (+ `ecom_shadow` for migrations) — pre-existing `ecomm` DB left untouched.

## Phase 2 — Authentication & authorization (API + both frontends)

- [x] API: customer register/login/logout/password-reset/profile; admin secure login; session/JWT; role-based guards (Customer / Admin / Inventory Manager). *(JWT access + rotating refresh; `@Public`/`@Roles` guards; reset tokens emit-event-ready, email delivery deferred to Phase 6.)*
- [x] Storefront: auth pages + session handling + protected customer routes. *(✅ Slice done — login + register + logout + protected `/account`. httpOnly-cookie session (`sf_access`/`sf_refresh`) via Next route handlers proxying the API; `proxy.ts` (Next 16 middleware) guards `/account`; server session helper refreshes on access-token expiry. 41 unit tests + 4 Playwright E2E green; smoke-verified against `ecom_dev`. **Follow-up:** password-reset request/confirm pages.)*
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
