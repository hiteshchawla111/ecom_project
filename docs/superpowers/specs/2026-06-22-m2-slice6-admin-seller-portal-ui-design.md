# M2 Slice 6 — Admin Seller-Portal UI — Design

> **Date:** 2026-06-22
> **Phase:** M2 (`IMPLEMENTATION_PLAN.md`), final slice. Branch: `feat/seller-system` (pushed to origin; rebased on `main` incl. the merged UI redesign PR #9).
> **Reads with:** `2026-06-22-m2-seller-system-design.md` (phase design), `apps/admin/CLAUDE.md`, `DESIGN.md` (tokens). Consumes the slice 3–5 seller APIs.

## Objective

Build the seller-facing portal inside `apps/admin`: an ACTIVE seller logs into the admin app and manages **their own** catalog and inventory through seller-scoped views (`/seller/*`), while admin/inventory-manager keep their existing experience unchanged. Plus the admin-side "sold by" column the M2 design calls for. All gating is UX-only — the API (slices 1–5) owns the real boundary.

## Decisions locked in brainstorming

1. **One app, role-branched.** SELLER is admitted into the existing admin shell; `AppShell` nav branches on role; a new `SellerOnlyRoute` (mirrors `AdminOnlyRoute`) gates the `/seller/*` subtree. No second app, no second shell.
2. **Sub-slice breakdown (6a–6e), each a RULE.md §1 stop-and-verify.** 6a is the gating foundation; 6b–6e build on it and are largely independent.
3. **Build with the merged UI redesign** — semantic surface tokens, redesigned `AppShell`, `components/ui/*`, dark mode. No hardcoded hex.
4. **Seed a stable ACTIVE seller** (`seller@example.com` / `Password123!`, slug `demo-shop`, a couple owned products+inventory) for browser smoke + manual testing.

## Architecture & role model

- **`Role` union + `roles.ts`:** add `'SELLER'`. `ProtectedRoute` admits SELLER into the shell (today it rejects any non-internal role via `isInternalRole`). A new `SellerOnlyRoute` gates `/seller/*` to `role === 'SELLER'`; cross-role access (admin → `/seller/*`, seller → `/products`) → `AccessDeniedPage`.
- **`AppShell` nav branches on role:** `role === 'SELLER'` → seller nav (Dashboard · My Products · My Inventory) + a seller-appropriate wordmark (label swap, not a new shell); internal roles keep today's nav verbatim.
- **Routes (under the existing shell):** `/seller` (dashboard), `/seller/products` (+ `/new`, `/:id/edit`), `/seller/inventory` (+ `/:productId`), all under `SellerOnlyRoute`. Admin subtree untouched.
- **API clients:** new `lib/sellerProducts.ts` + `lib/sellerInventory.ts` → `/seller/products` + `/seller/inventory`, reusing `apiClient` + the existing `Paginated`/`Product`/movement types. The existing `lib/products.ts`/`lib/inventory.ts` (admin endpoints) are unchanged.

## Sub-slices (implement 6a first; each stops for verification)

### 6a — Foundation (gating; everything depends on it)
- `Role` += `'SELLER'`; `roles.ts` admits SELLER into the shell; `SellerOnlyRoute`; role-branched `AppShell` nav + wordmark; `/seller` route + a minimal seller **Dashboard** (honest placeholders à la the admin DashboardPage — e.g. "My products" count from `listSellerProducts({page:1,pageSize:1}).total`, low-stock placeholder).
- `lib/sellerProducts.ts` + `lib/sellerInventory.ts` (at least the read functions the dashboard needs; remaining functions may land with 6b/6d).
- **Seed:** extend `prisma/seed.ts` (idempotent) with the ACTIVE seller user + Seller row + a couple owned products/inventory.
- **Verifiable:** SELLER logs in → seller dashboard + seller nav; admin → admin nav unchanged; cross-role `/seller/*` and `/products` → AccessDenied. Role-gate tests (mirror `AppShell.inventory.test.tsx`).

### 6b — My Products
- Seller products list (pagination, status actions) + create/edit forms → `/seller/products`. Mirrors admin `ProductsPage`/`ProductNewPage`/`ProductEditPage`, scoped.
- **Verifiable:** seller creates/edits/archives/activates their own products in-browser; cross-tenant is impossible (API 404s — surfaced as not-found).

### 6c — CSV bulk upload
- File-picker upload to `POST /seller/products/import` + per-row result report UI (created / failed / errors). A view or action on the products page.
- **Verifiable:** seller uploads a CSV → sees the created/failed report; bad rows listed with reasons.

### 6d — My Inventory
- Seller stock list (available/reserved/low-stock) + per-product detail/movement-history + adjust form → `/seller/inventory`. Mirrors admin `InventoryPage`/`InventoryItemPage`, scoped.
- **Verifiable:** seller views/adjusts own stock; movement history renders; available updates after an adjustment.

### 6e — Admin "sold by"
- **API:** add `seller: { select: { displayName: true, slug: true } }` to `PRODUCT_INCLUDE` (`products.service.ts`) + the response type; admin product list/detail include the owning seller. (The product API currently includes only `category` + `images`.)
- **Admin UI:** "Sold by" column on `ProductsPage` (and detail). Reuses the merged table styling.
- **Verifiable:** admin product list shows the owning seller's name (e.g. "Platform", "demo-shop").

## Conventions & design system

- Reuse semantic surface tokens (`bg-surface`/`-sunk`/`-muted`, `text-content`/`-muted`/`-subtle`, `border-line`, `primary-*`), the redesigned `AppShell`, `components/ui/*` (Pagination, StatCard, ThemeToggle, accessible row-action menu), dark mode. **No hardcoded hex** (`DESIGN.md`).
- Mirror admin page patterns; extract a shared presentational unit only when it's genuinely clean — otherwise focused parallel pages with the `lib/` client as the seam. No premature abstraction; don't refactor the admin pages beyond what 6e needs.
- Accessibility (hard requirement): semantic HTML, keyboard nav, focus states, WCAG-AA contrast, status/stock states never color-only, confirm destructive/stock actions.

## Testing

- Vitest + RTL, co-located `*.test.tsx` (admin convention). Each sub-slice ships component + role-gate tests. Critical gate tests: a SELLER sees seller nav and cannot reach admin routes; an admin/inventory-manager cannot reach `/seller/*` (mirror `AppShell.inventory.test.tsx`).
- Browser smoke per sub-slice (admin `:5002` vs API `:5000`) using the seeded `seller@example.com`. Frontend slice → RULE.md §5 wants the real thing in the browser, not just tests.

## API changes (minimal, contained)

- **6e only:** `PRODUCT_INCLUDE` gains a `seller` projection (+ response type). This touches `apps/api` (the only backend change in slice 6); ships in 6e so the seller-portal sub-slices stay frontend-only.
- **6a:** `prisma/seed.ts` gains the dev seller (idempotent). No schema change.

## Out of scope (slice 6)

Seller order fulfillment (M5a — sellers don't receive split orders yet), seller analytics/earnings (M6c/M7a), seller public storefront page (M3a `/seller/:slug`), notification-feed UI (M4b), admin seller-picker for product authoring (deliberately not built — M2 design). The seller portal manages catalog + stock only, matching the slice 3–5 API surface.
