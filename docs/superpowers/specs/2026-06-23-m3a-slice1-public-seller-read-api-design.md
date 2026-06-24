# M3a Catalog V2 — Slice 1: Public Seller-Read API (design)

**Date:** 2026-06-23
**Phase:** M3a — Catalog V2 (`docs/IMPLEMENTATION_PLAN.md`)
**Branch / worktree:** `feat/catalog-v2` (`worktree-feat-catalog-v2`)
**Depends on:** M2 (merged to `main` via PR #11, `a66a06e`) — `Seller` entity, `Product.sellerId`, `slug @unique`.

## Slice scope

The first independently-verifiable slice of M3a. **API-only:** the public seller-read
surface that the storefront slices (2: "sold by" link; 3: `/seller/[slug]` page) will consume.

- **In scope:** two public endpoints — public seller profile by slug, and that seller's
  paginated ACTIVE catalog.
- **Out of scope (later slices):** storefront product-detail "sold by" link (Slice 2);
  `/seller/[slug]` storefront page (Slice 3); `Product.ratingAvg/ratingCount` columns +
  rating placeholders (Slice 4 — coordinate migration **F2** with M4a Reviews).

### Already shipped (do not rebuild)

- M2 slice 6e already added a **public-safe `seller {displayName, slug}` projection** to the
  public product detail/list responses (`products.service.ts` `PRODUCT_INCLUDE`). This slice
  does **not** touch that.

## Contract

Both endpoints are `@Public()` on a new public sellers controller.

### `GET /sellers/:slug`
Resolve an **ACTIVE, non-soft-deleted** seller by `slug`.
- **200** → `{ id, displayName, slug, description, logoUrl }` — **exactly these 5 fields**.
  No `status`, no KYC presence flags, no timestamps, no bank/last-4 — those belong to the
  admin/owner view (`toSellerView`), never the public surface.
- **404** → any other seller status (`PENDING_REVIEW`/`SUSPENDED`/`DEACTIVATED`),
  soft-deleted, or unknown slug. No existence leak.

### `GET /sellers/:slug/products`
Paginated **ACTIVE, non-soft-deleted** products owned by that ACTIVE seller.
- **200** → existing `Paginated<Product>` envelope with the existing `PRODUCT_INCLUDE`
  projection (category, images, `seller {displayName, slug}`). Accepts the existing
  pagination/sort query params (`page`, `pageSize`, `sortBy`, `sortDir`).
- Empty catalog for a valid ACTIVE seller → **200** with `data: []` (the shop exists).
- **404** → seller slug not publicly visible (same ACTIVE gate as the profile endpoint).
- `status` is **forced to ACTIVE server-side**; any client-supplied status is ignored.

## Internals

### New files (API)
- `apps/api/src/sellers/public-seller-view.ts` — `PublicSellerView` interface +
  `toPublicSellerView(seller)` returning exactly the 5 public fields. Lives beside
  `seller-mask.ts` so the public surface is explicit and cannot inherit admin/KYC fields.
- `apps/api/src/sellers/public-sellers.controller.ts` — `@Controller('sellers')`, both
  routes `@Public()`, thin (delegates to services).

### Service changes
- `SellersService.getPublicBySlug(slug): Promise<PublicSellerView>` —
  `findFirst({ where: { slug, status: ACTIVE, deletedAt: null } })`; `NotFoundException`
  if none; map via `toPublicSellerView`.
- `SellersService.getActiveSellerIdBySlug(slug): Promise<string>` — same ACTIVE + not-deleted
  gate, returns the id (or 404). Used by the products route so both endpoints 404 consistently.
- `ProductsService.list()` gains an **optional third arg** `filter?: { sellerId?: string }`
  (**Approach A**). `buildWhere` applies `where.sellerId = filter.sellerId` when present.
  This is **orthogonal** to `buildSellerScope(actor)` (which confines the *caller*): a public
  caller (`PUBLIC_READ_ACTOR`, unscoped) lists a *specific* seller's catalog without abusing
  the ownership mechanism. Existing callers pass nothing → behavior unchanged.

### Controller flow — `/sellers/:slug/products`
resolve slug → sellerId (ACTIVE gate, else 404) →
`products.list({ ...query, status: ACTIVE }, PUBLIC_READ_ACTOR, { sellerId })`.

### Wiring
Register `PublicSellersController` in `SellersModule`; make `ProductsService` available
to it (import `ProductsModule` / export `ProductsService`).

## Approach decision

`GET /sellers/:slug/products` reuses `products.service.list()` rather than a bespoke query,
to keep one pagination/projection/sort path.

- **Chosen — A: optional `sellerId` filter on `list()`.** Explicit, orthogonal to ownership
  scoping, generically useful (future admin "by seller" views).
- **Rejected — B: synthetic SELLER actor.** Overloads the caller-confinement mechanism;
  `buildSellerScope` throws `Forbidden` on a missing id — semantically wrong and fragile.
- **Rejected — C: dedicated `findActiveProductsBySeller()` in sellers.service.** Duplicates
  pagination + `PRODUCT_INCLUDE` + sort that `products.service` owns; drift risk.

## Tests (TDD: red → green → refactor)

Unit tests with mocked Prisma, mirroring `products.service.spec.ts` / `sellers.service.spec.ts`:
- `toPublicSellerView`: given a full seller row (incl. gstin/pan/bank/status/timestamps),
  output has **exactly** the 5 public fields — regression guard against field leak.
- `SellersService.getPublicBySlug`: ACTIVE → mapped view (asserts KYC/status/timestamps
  **absent**); non-ACTIVE / soft-deleted / unknown → `NotFoundException`.
- `SellersService.getActiveSellerIdBySlug`: ACTIVE → id; non-ACTIVE/unknown → `NotFoundException`.
- `ProductsService.list` with `{ sellerId }`: where-clause includes `sellerId`; **without**
  the filter → unchanged (existing tests stay green).
- Optional e2e (`*.e2e-spec.ts`) for both routes' 200/404, matching existing e2e style.

## Errors / edges
- Unknown or non-public slug → **404** (both endpoints).
- Empty ACTIVE-seller catalog → **200** `data: []`.
- Public product list forces `status=ACTIVE`; ignores client-supplied status.
- Pagination bounds reuse existing DTO validation (`pageSize` ≤ 100, etc.).

## Verification (RULE.md §5)
1. API `npm test` green incl. new tests; no regressions in the full suite.
2. `tsc --noEmit` + `npm run lint` clean (run `tsc --noEmit` explicitly — `nest build`
   swallows tsc errors per project memory).
3. **HTTP smoke vs `ecom_dev`** (`npm run start:dev`):
   - `GET /sellers/<seeded-active-slug>` → 200, **only** the 5 public fields (no KYC/status).
   - `GET /sellers/<slug>/products` → 200, paginated ACTIVE products.
   - suspended / unknown slug → 404 (both endpoints).

## Risks
- **Leak of inactive products / non-public sellers** → ACTIVE gate on both the seller lookup
  and the product status filter; `toPublicSellerView` field allowlist + leak-regression test.
- **Cross-tenant confusion** → the `sellerId` *filter* is deliberately separate from the
  ownership *scope*; documented in code.
- **No new migration** in this slice (`ratingAvg/ratingCount` deferred to Slice 4 / F2).
