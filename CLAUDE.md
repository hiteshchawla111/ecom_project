# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **monorepo root**. App-specific guidance lives in each app's own `CLAUDE.md` and is imported below.

## Imports

@RULE.md
@apps/storefront/CLAUDE.md
@apps/admin/CLAUDE.md
@apps/api/CLAUDE.md

## Project Status

**Greenfield, docs-first.** The repo currently contains the PRD, these guidance docs, and empty `apps/*` directories — the three apps are **not yet scaffolded** (no `package.json`, no installs). `PLAN.md` is the implementation roadmap. Update the per-app `CLAUDE.md` Commands sections (currently aspirational) as real code lands.

## Product

An e-commerce portal. Full spec: `docs/E-Commerce Portal PRD.pdf` — read it before non-trivial work. Build roadmap: `PLAN.md`. Visual design tokens: `DESIGN.md`.

Three surfaces, three roles:
- **Storefront** (`apps/storefront`) — customer-facing: discovery, cart, checkout, order tracking, profile.
- **Admin** (`apps/admin`) — internal: product/category/order/customer management, inventory, analytics.
- **API** (`apps/api`) — shared backend for both frontends.

**Roles** (authorization is enforced in the API, never trusted from a client):
- **Customer** — browse/search, cart, place & track orders, manage profile.
- **Admin** — manage products, categories, inventory, orders, customers; view analytics.
- **Inventory Manager** — manage stock, view inventory reports, process stock adjustments.

## Architecture (monorepo)

```
apps/
  storefront/   Next.js (App Router + TS)  — SSR/SEO customer site
  admin/        React + Vite + TS          — internal SPA (admin + inventory)
  api/          NestJS + TS + Prisma        — PostgreSQL backend, single source of truth
```

Both frontends consume `apps/api`. The API owns all business rules and the role boundary; frontends handle UX (redirects, rendering) only.

### Cross-cutting concerns (reason about these before adding features)

- **Order state machine** — `Pending → Confirmed → Processing → Shipped → Delivered`, with `Cancelled` and (post-payment) `Refunded` branches. Valid transitions enforced server-side.
- **Inventory ledger** — track **available** vs **reserved** stock; all changes go through append-only *movements*, never raw quantity mutation. Order placement reserves, fulfillment deducts, cancellation releases. Low-stock alerts on threshold crossing.
- **Cart/total pipeline** — one server-authoritative function: `subtotal → discounts → taxes → shipping → grand total`. Backs both cart view and order review. Never computed client-side.
- **Notifications** — fire on domain events, not inline in handlers.
- **Analytics** — read-mostly aggregations (revenue, AOV, conversion, best sellers, inventory valuation, new vs returning). Use queries/materialized views.

## Non-Functional Requirements (acceptance criteria, from PRD)

Performance (fast loads, optimized API), Security (secure auth, authorization, input validation, **audit logging**), Scalability (paginate + index list endpoints), Reliability (error handling, monitoring, logging, recovery), Accessibility (keyboard nav, screen readers, **WCAG** — see `DESIGN.md`).

## Out of Scope (Future Enhancements — do not build unless asked)

Payment gateways (checkout creates an order but does **not** process payment), product reviews, wishlist, coupons, promotions, loyalty program, recommendations, multi-warehouse inventory, multi-vendor marketplace, AI-powered search.

## Workflow Rules

- **One feature at a time.** After completing any single feature, **stop and ask the user to verify** before starting the next. Do not implement multiple features in one go.
- **Keep `PLAN.md` updated.** It is the live progress tracker — when a task/phase starts or finishes, update its checkbox and the status tables in `PLAN.md` (⬜ Not Started · 🟡 In Progress · ✅ Done).

## Conventions (apply repo-wide)

- Strict TypeScript; avoid `any`. Types live close to their domain.
- Functional React components + hooks; extract reusable hooks; avoid prop drilling.
- Consume `DESIGN.md` tokens via Tailwind theme — never hardcode hex values.
- **UI follows the "Quiet-Luxury" system in `DESIGN.md`** (serif headings, squared radii, uppercase letterspaced labels, brand-color filled buttons, shadcn primitives, GSAP motion). Read that section before any UI work and match it so storefront + admin stay consistent.
- **Filled buttons use `bg-primary-600 text-white`, never `bg-content`/`text-surface`** — the latter invert per theme and wash out in dark mode.
- Follow patterns established in each app once code exists; don't refactor unrelated code.
- Small, focused commits; never commit secrets. Verify before claiming done (compile + lint + tests). **For UI, also screenshot both light and dark themes.**
