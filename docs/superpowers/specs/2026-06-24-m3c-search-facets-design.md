# M3c Search — Slice 3: Faceted Filters API (Design)

> **Date:** 2026-06-24 · **Phase:** M3c (Search) · **Branch/worktree:** `worktree-feat-search-v2-slice3` (off `main` @ `e1c69dc`)
> **Status:** Approved design. Implementation follows RULE.md (TDD; one slice; smoke-run the real thing).
> **Builds on:** Slice 1 (FTS foundation) + Slice 2 (autocomplete + follow-ups), both merged to `main` (`e1c69dc`). Reads with the slice-1/2 design docs, ADR-009/011, `docs/IMPLEMENTATION_PLAN.md` (M3c).

## Objective

Add faceted filtering to `GET /products/search`: accept facet **filter** params
(brand/category/price/rating) that narrow the ranked results, and return facet
**counts** so the storefront (slice 4) can render filter UI with availability.
No new module, no migration — reuses the K2 GIN index and existing
`brand`/`categoryId`/`price`/`ratingAvg` columns.

## Scope

**In scope**
- Extend `SearchProductsDto` with `brand`, `categoryId`, `minPrice`, `maxPrice`, `minRating`.
- Extend `ProductSearch.search()` with an optional `filters` arg; add `facets` to `ProductSearchResult`.
- `PostgresProductSearch.search()`: apply filters to the ranked results query + compute
  **disjunctive** facet counts (each facet's counts omit its own filter).
- A pure, unit-tested `buildSearchWhere(...)` helper (the disjunctive core).
- e2e with seeded fixtures asserting counts; extend `smoke-search.sh`.

**Out of scope (later slices / future)**
- Storefront facet UI (slice 4).
- Multi-value facet selection (`brand=A&brand=B`) — single-value now, disjunctive design extends to it later.
- Price histogram buckets (min/max only for v1 slider).
- Elasticsearch adapter; search analytics.

## Decisions (from brainstorming, 2026-06-24)

1. **Full faceted search** — filters AND counts (the coherent capability slice 4 needs). (Q1=A)
2. **Disjunctive counts** — each facet's counts ignore its OWN selected value but honor all
   other filters + the text query (marketplace-standard; lets the UI show alternatives). (Q2=B)
3. **Per-facet bucket shapes** — brand/category = discrete value buckets w/ counts; price =
   `{min,max}` (slider, no histogram); rating = threshold buckets (`>=4/3/2/1`, "& up"). Price
   uses regular `price` (consistent with catalog filter). (Q3=A)
4. **Single-value filter params now** (`brand?`, `categoryId?`, `minPrice?`, `maxPrice?`,
   `minRating?`) — multi-select deferred; disjunctive counts still show alternatives. (Q4=A)
5. **Evolve `search()`** with optional `filters` + add always-present `facets` to the result
   (one capability on the existing seam; optional param keeps existing callers/e2e working). (Q5=A)
6. **WHERE-builder + parallel queries + smoke/e2e** — pure `buildSearchWhere` (unit-tested);
   provider runs results query + 4 facet-count queries via `Promise.all`. (Q6=A)
7. **Verify counts via BOTH** an HTTP smoke (vs `ecom_dev`) AND a seeded-fixture e2e. (Q6 follow-up)

## Architecture

```
apps/api/src/search/
  search-filters.ts            # NEW: SearchFilters type + buildSearchWhere() (pure, unit-tested — disjunctive core)
  product-search.ts            # EXTEND: search() gains optional `filters`; ProductSearchResult gains `facets`; facet types
  postgres-product-search.ts   # EXTEND: search() applies filters + runs disjunctive facet-count queries (Promise.all)
  search.controller.ts         # EXTEND: SearchController.search reads facet params from DTO, builds filters
  dto/search-products.dto.ts   # EXTEND: brand?, categoryId?, minPrice?, maxPrice?, minRating?
apps/api/test/
  search-facets.e2e-spec.ts    # NEW: seeded-fixture e2e asserting disjunctive counts
apps/api/scripts/smoke-search.sh # EXTEND: loose facet assertions vs ecom_dev
```

- Disjunctive logic isolated in pure `buildSearchWhere` — given filters + an optional facet to
  **omit**, returns the parameterized WHERE fragment. The error-prone part, unit-tested
  (the `buildPrefixTsQuery` lesson).
- `search()` orchestrates: 1 filtered results query (existing two-step) + 4 facet-count queries
  (brand/category/price/rating), each via `buildSearchWhere` with its own facet omitted, in `Promise.all`.
- `ProductSearch` seam stays one method; the future ES adapter implements the richer `search`.

## Data flow — `GET /products/search?q=phone&brand=Acme&minPrice=100&minRating=4`

1. **DTO → controller** builds `filters = { brand:'Acme', minPrice:100, minRating:4 }`,
   calls `search(q, page, pageSize, filters)`.
2. **Base predicate** (shared): `deletedAt IS NULL AND status='ACTIVE'` + (if `q` non-blank)
   the `@@ websearch_to_tsquery('english', q)` text match (same K2-index expression as slice 1).
3. **Results query** — base + ALL filters → ranked, paginated page + `count(*) OVER()` total
   (existing two-step: ranked IDs → Prisma hydrate → re-sort). `total`/`totalPages` = fully-filtered set.
4. **Facet-count queries (disjunctive — each omits its own filter), `Promise.all`:**
   - **Brands:** base + category + price + rating (brand omitted), `GROUP BY brand` where
     `brand IS NOT NULL` → `[{value,count}]` desc by count.
   - **Categories:** base + brand + price + rating (category omitted), `GROUP BY categoryId`
     joined to `Category.name` → `[{categoryId,name,count}]`.
   - **Price:** base + brand + category + rating (price omitted), `min(price),max(price)` → `{min,max}|null`.
   - **Ratings:** base + brand + category + price (rating omitted), four counts
     (`ratingAvg >= 4/3/2/1`) → `[{minRating,count}]`.
5. **Assemble** `ProductSearchResult { data, page, pageSize, total, totalPages, facets }`.
   Facets ALWAYS present (empty `[]` / `price:null` when no matches).

**Blank-`q` rule:** blank `q` AND no filters → empty page + empty facets (preserves slice-1).
Blank `q` WITH ≥1 filter → run (facet browse mode). Filter values bound as SQL params (no injection).

## DTO / controller / types

`SearchProductsDto` adds (mirroring catalog `ListProductsDto` validators):
- `brand?: string` `@IsOptional @IsString @MaxLength(120)`
- `categoryId?: string` `@IsOptional @IsString @MaxLength(120)`
- `minPrice?: number` `@IsOptional @Type(()=>Number) @IsPositive`
- `maxPrice?: number` `@IsOptional @Type(()=>Number) @IsPositive`
- `minRating?: number` `@IsOptional @Type(()=>Number) @Min(1) @Max(5)`

Types:
```typescript
SearchFilters = { brand?: string; categoryId?: string; minPrice?: number; maxPrice?: number; minRating?: number }
SearchFacets = {
  brands:     { value: string; count: number }[];
  categories: { categoryId: string; name: string; count: number }[];
  price:      { min: string; max: string } | null;     // strings (Postgres numeric)
  ratings:    { minRating: number; count: number }[];   // thresholds 4,3,2,1
}
// ProductSearchResult gains: facets: SearchFacets
// search(q, page, pageSize, filters?: SearchFilters): Promise<ProductSearchResult>
```

## Error handling

- Invalid DTO (`minPrice`/`maxPrice` non-positive, `minRating` ∉ 1..5, bad types) → 400 (global `ValidationPipe`).
- Blank `q` + no filters → empty page + empty facets (slice-1 preserved). Blank `q` + filters → browse mode.
- Filter values bound as SQL params → no injection; text predicate reuses the GIN index.
- `@Public`, ACTIVE-only, all sellers. Unexpected DB error → 500 (not swallowed).
- Unknown brand/categoryId value → zero results + facets reflect it (not an error).

## Testing

**Unit — `buildSearchWhere` (pure, disjunctive core):** base predicate; each filter adds its
clause; `omit` drops exactly one facet's clause (brand-omit keeps category/price/rating, etc.);
blank-q-no-filters vs blank-q-with-filters; parameter list correctness.

**Unit — `search()` orchestration (mocked Prisma):** results query + 4 facet queries fire with the
right (omitted-filter) WHERE per facet; `Promise.all`; facets always present; empty result → empty
buckets / `price:null`; envelope/`total` math; blank-q-no-filters short-circuits (no DB).

**e2e — `search-facets.e2e-spec.ts` (seeded fixtures, deterministic):** seed a unique-namespace set
(≥3 brands across 2 categories, varied prices, some rated) via PrismaService; assert brand buckets +
counts; **disjunctive** behavior (brand=X still shows other brands' counts); category counts honor the
brand filter; price min/max; rating threshold counts; filtered `total`. Namespaced cleanup (FK order),
mirroring `test/public-sellers.e2e-spec.ts`. Seeds its own data — shared `ecom_dev` has all-NULL
ratings + messy brands.

**HTTP smoke — extend `smoke-search.sh`:** loose assertions vs `ecom_dev` — facets block present with
`brands`/`categories`/`price`/`ratings` keys; a brand filter narrows `total`; index still used.

**Verification gate:** full jest suite green + new e2e green + `tsc --noEmit` clean for `src/search`
(only the 3 known pre-existing unrelated errors) + lint clean + HTTP smoke passes vs `ecom_dev`.

## Acceptance criteria

- `GET /products/search` accepts brand/categoryId/minPrice/maxPrice/minRating and narrows the
  ranked, ACTIVE-only results; `total`/`totalPages` reflect the filtered set.
- Response includes an always-present `facets` block: brand & category value buckets w/ counts,
  price `{min,max}`, rating threshold buckets.
- Facet counts are **disjunctive** (a facet's counts ignore its own selected value, honor the rest).
- Blank `q` + filters = browse mode; blank `q` + no filters = empty.
- All inputs parameterized (no injection); GIN index still serves the text predicate.
- All slice-1/2 + M0–M3 tests still green.

## Risks

- **Disjunctive WHERE correctness** → isolated in pure unit-tested `buildSearchWhere`; the per-facet
  "omit own filter" is the main error surface.
- **N+1 aggregation latency** → 5 parallel queries (`Promise.all`); fine at seed/catalog scale
  (<3s p90). If heavy later, a single grouping-sets query is a future optimization.
- **Seed data thin** (ratings all NULL, brands mostly NULL in `ecom_dev`) → e2e seeds its own
  deterministic fixtures; smoke stays loose.
