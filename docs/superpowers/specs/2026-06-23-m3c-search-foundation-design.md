# M3c Search — Slice 1: Backend FTS Foundation (Design)

> **Date:** 2026-06-23 · **Phase:** M3c (Search) · **Branch/worktree:** `feat/search-v2`
> **Status:** Approved design. Implementation follows RULE.md (TDD; one slice; smoke-run the real thing).
> **Reads with:** `docs/IMPLEMENTATION_PLAN.md` (M3c), `docs/ARCHITECTURE_DECISIONS.md` (ADR-009/010/011), `docs/MIGRATION_PLAN.md` (K2).

## Objective

Stand up the backend full-text search foundation for the marketplace: a swappable
`ProductSearch` provider seam (ADR-009) with a Postgres GIN FTS default
implementation (ADR-011), the K2 FTS index migration, and a ranked public
`GET /products/search` endpoint. This is **slice 1 of M3c** — autocomplete
(`/products/suggest`), faceted filters, and the storefront UI are **later slices**,
out of scope here.

## Scope

**In scope**
- New `search` NestJS module: `ProductSearch` interface + token, `PostgresProductSearch`
  impl, `SearchController` (`GET /products/search`), `SearchProductsDto`.
- K2 migration: GIN FTS index on `Product` via raw SQL (`CONCURRENTLY`, isolated migration).
- Ranked, paginated, public, ACTIVE-only search returning the same `Paginated<Product>`
  envelope + relation includes as the catalog list.

**Out of scope (later M3c slices)**
- Autocomplete / `GET /products/suggest`.
- Faceted filters (brand / category / price / rating).
- Storefront search/autocomplete/facet UI.
- Elasticsearch adapter (the provider seam makes this a later config swap).
- Folding the existing `GET /products` catalog list onto FTS (kept on `contains`).

## Decisions (from brainstorming, 2026-06-23)

1. **Separate `GET /products/search` endpoint.** The existing `GET /products`
   (`contains` list + seller scope) is **untouched** — zero regression risk. (Q1=A)
2. **Dedicated `search` module** owns the provider token, the Postgres impl, the
   controller, and the DTO. `ProductsModule` stays CRUD-focused. (Q2=A)
3. **Public, ACTIVE-only, all sellers, no auth/scope.** Search is buyer discovery;
   `status = ACTIVE` and `deletedAt IS NULL`, every seller's products, `@Public`.
   Sellers manage their own catalog via the existing seller-scoped list, not search. (Q3=A)
4. **Ranking:** `websearch_to_tsquery('english', q)` (safe on arbitrary user input) +
   `ts_rank` over a **weighted** vector — `setweight(name,'A') || setweight(description,'B')`
   so name outranks description. Order by `rank DESC, createdAt DESC`. Blank/whitespace
   `q` → empty page (200), no DB hit. (Q4=A)
5. **Two-step query:** raw `$queryRaw` returns ranked page of IDs + total
   (`count(*) OVER()`), then Prisma `findMany({ where: { id: { in: ids } }, include })`
   hydrates, re-sorted in JS into rank order. Reuses the catalog `PRODUCT_INCLUDE`
   so the response is byte-identical to catalog responses. (Q5=A)
6. **Tests:** unit (mocked Prisma) for seams/orchestration/envelope; **scripted HTTP
   smoke vs `ecom_dev`** for SQL correctness (ranking, websearch parsing, ACTIVE-only,
   pagination). (Q6=A + scripted-smoke)

## Architecture

```
apps/api/src/search/
  search.module.ts            # imports PrismaModule; binds ProductSearch → PostgresProductSearch; declares SearchController
  product-search.ts           # ProductSearch injection token + interface (ADR-009 seam)
  postgres-product-search.ts  # PostgresProductSearch — GIN FTS impl (default binding)
  search.controller.ts        # @Controller('products') @Get('search') @Public
  dto/search-products.dto.ts  # q, page, pageSize (class-validator)
```

- `ProductSearch` is the contract domain code depends on. Bound via
  `{ provide: ProductSearch, useClass: PostgresProductSearch }`. A future ES adapter
  is a one-line binding swap (ADR-010); the controller never changes.
- Controller is `@Controller('products')` with `@Get('search')` → route
  `GET /products/search`. The static `search` segment must take precedence over
  `ProductsController`'s `@Get(':id')` (different module). **Verify route precedence
  in the smoke** — if `:id` shadows it, mount the search controller before/with a more
  specific path.
- `SearchModule` added to `AppModule` imports. `ProductsModule` untouched.
- `PRODUCT_INCLUDE` and the `Paginated<T>` shape are reused from the products domain so
  search responses match catalog responses exactly. Export/share the `PRODUCT_INCLUDE`
  const rather than duplicating it.

## Data flow — `GET /products/search?q=aurora&page=1&pageSize=20`

1. **DTO validation** — `q: string` (trimmed); `page`/`pageSize` optional positive ints,
   same defaults/bounds as `ListProductsDto` (page 1, size 20). Invalid → 400 via global
   `ValidationPipe`.
2. **Blank-`q` short-circuit** — empty/whitespace after trim → return
   `{ data: [], page, pageSize, total: 0, totalPages: 1 }`. No DB hit.
3. **Step 1 — raw SQL (parameterized `$queryRaw`):**
   ```sql
   SELECT p.id,
          ts_rank(
            setweight(to_tsvector('english', p.name), 'A') ||
            setweight(to_tsvector('english', coalesce(p.description, '')), 'B'),
            websearch_to_tsquery('english', $1)
          ) AS rank,
          count(*) OVER() AS total
   FROM "Product" p
   WHERE p."deletedAt" IS NULL
     AND p.status = 'ACTIVE'
     AND to_tsvector('english', p.name || ' ' || coalesce(p.description, ''))
         @@ websearch_to_tsquery('english', $1)
   ORDER BY rank DESC, p."createdAt" DESC
   LIMIT $2 OFFSET $3;
   ```
   - The `@@` filter expression **matches the K2 index expression exactly** so the GIN
     index is used.
   - Ranking uses the weighted vector (computed on candidate rows only); K2 stays
     unweighted per `MIGRATION_PLAN`.
   - `count(*) OVER()` returns total alongside the page (no separate count query).
   - `$1` = trimmed user query (parameterized — no injection).
4. **Step 2 — Prisma hydrate:** `findMany({ where: { id: { in: ids } }, include: PRODUCT_INCLUDE })`,
   then **re-sort in JS** into the `ids` order (`IN` doesn't preserve order). If step 1
   returns zero IDs, skip step 2 → empty page.
5. **Envelope:** `Paginated<Product>` with `total` from the window function,
   `totalPages = max(1, ceil(total / pageSize))`.

**NULL handling:** `coalesce(description,'')` is used in **both** the index DDL and the
query, so a NULL description doesn't null the whole `tsvector`. (Seed has no NULL
descriptions today; this is defensive.)

## K2 migration

Dedicated, non-transactional Prisma migration containing only:
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Product_fts_idx" ON "Product"
  USING GIN (to_tsvector('english', "name" || ' ' || coalesce("description", '')));
```
- `prisma migrate dev --create-only --name product_fts_gin`, hand-edit to the above,
  ensure **no transaction wrapper** (so `CONCURRENTLY` can run — `MIGRATION_PLAN §2.1/§4`).
- **Documented deviation** from the migration-plan's literal DDL: added
  `coalesce("description",'')` for NULL-safety, matching the query side.
- Forward-only; no backfill (pure index). Applied to `ecom_dev` (shadow `ecom_shadow`).
  The pre-existing `ecomm` DB is never touched.
- **Fallback (documented):** if Prisma's runner rejects the non-transactional
  `CONCURRENTLY` file, apply a plain `CREATE INDEX` (acceptable on dev/seed-scale, no
  concurrent write load) and note that production should build it `CONCURRENTLY`
  out-of-band. Try `CONCURRENTLY` first.

## Error handling

- Invalid DTO → 400 (global `ValidationPipe`).
- Blank/whitespace `q` → 200 empty page (forgiving, not an error).
- `websearch_to_tsquery` never throws on arbitrary input (quotes, `-term`, `or`,
  gibberish) — the reason it's chosen over `to_tsquery`. No parse try/catch needed.
- Unexpected DB error → 500 (Nest default); not swallowed.
- No auth/guards — `@Public`, ACTIVE-only, all sellers.

## Testing

**Unit (mocked Prisma, Jest — the TDD red→green loop)**
- DTO validation: `page`/`pageSize` defaults + rejection of invalid (< 1, non-numeric).
- Provider: blank `q` → empty page, **zero DB calls** (`$queryRaw`/`findMany` not called).
- Provider: non-blank `q` → `$queryRaw` called with trimmed query + correct LIMIT/OFFSET,
  then `findMany({ where: { id: { in: [...] } }, include })`; results **re-sorted into
  rank order** (mock `$queryRaw` → ids `[b,a]`, mock `findMany` → `[a,b]`, assert `[b,a]`).
- Envelope math: `total` from window value, `totalPages` ceil; empty step-1 → skip step-2.
- Controller: `GET /products/search` → provider; `@Public`.

**Scripted HTTP smoke vs `ecom_dev` (RULE.md §5 gate, committed script)**
- Boot API (`start:dev`) against real DB; `curl` the endpoint.
- Assertions:
  - `q=aurora` → "Aurora Smartphone X/Lite" rank above any description-only match
    (**name-weighting proven**).
  - `q=phone` returns the Auroras (description hit).
  - multi-word `q=oled display`, quoted `q="OLED display"`, `q=-budget` → 200, no error
    (**websearch parsing proven**).
  - ACTIVE-only (no archived/inactive leak).
  - pagination (`pageSize=1` → correct `total`, two distinct pages).
  - response includes `category` / `images` / `seller` like the catalog.
  - K2 index exists / is used (`\d "Product"` or `EXPLAIN`).

**Verification gate before "done":** unit suite green + full API suite green +
`tsc --noEmit` clean (memory: `nest build` swallows tsc errors) + lint clean + HTTP
smoke passes vs `ecom_dev`.

## Acceptance criteria (this slice)

- `GET /products/search?q=...` returns ranked, paginated, ACTIVE-only products across
  all sellers, in the catalog response shape.
- Name matches outrank description-only matches.
- Arbitrary user input never errors (websearch parsing).
- Blank `q` → empty page.
- `ProductSearch` is injectable and swappable by binding (ES later = config change).
- K2 GIN index exists and serves the match filter.
- Existing `GET /products` and all M0–M2 tests unchanged/green.

## Risks

- **Route precedence** (`/products/search` vs `/products/:id`) — verify in smoke.
- **`CONCURRENTLY` + Prisma migration runner** — fallback to plain index on dev if blocked.
- **Index/query expression drift** — the `@@` filter must match the index expression
  verbatim (incl. `coalesce`) or the GIN index won't be used; asserted in smoke via EXPLAIN.
