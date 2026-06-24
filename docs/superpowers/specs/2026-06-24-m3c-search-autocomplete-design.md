# M3c Search — Slice 2: Autocomplete + slice-1 follow-ups (Design)

> **Date:** 2026-06-24 · **Phase:** M3c (Search) · **Branch/worktree:** `worktree-feat-search-v2-slice2` (off `main` @ `a71e4cc`)
> **Status:** Approved design. Implementation follows RULE.md (TDD; one slice; smoke-run the real thing).
> **Builds on:** Slice 1 (backend FTS foundation), merged to `main` (`a71e4cc`). Reads with `docs/superpowers/specs/2026-06-23-m3c-search-foundation-design.md`, ADR-009/011, `docs/IMPLEMENTATION_PLAN.md` (M3c).

## Objective

Add prefix-matched product **autocomplete** (`GET /products/suggest`) on the slice-1
search foundation, and close the two slice-1 whole-branch-review follow-ups
(dedupe `PRODUCT_INCLUDE`; add a route-precedence e2e guard). Faceted filters and
the storefront autocomplete UI remain **later slices**.

## Scope

**In scope** — three separable workstreams, each its own task/commit:
1. **Autocomplete feature** — `suggest()` on the `ProductSearch` seam; `PostgresProductSearch`
   impl (prefix `to_tsquery` over the K2 GIN index, scalars only); `GET /products/suggest`
   (`@Public`); `SuggestProductsDto`.
2. **Follow-up #1** — export the catalog `PRODUCT_INCLUDE` and share it with the search seam
   (kill the duplicated `PRODUCT_SEARCH_INCLUDE`).
3. **Follow-up #2** — `search-routes.e2e-spec.ts` asserting `/products/search` and
   `/products/suggest` resolve (200, not 404).

**Out of scope (later M3c slices)** — faceted filters (brand/category/price/rating);
storefront autocomplete + facet UI; Elasticsearch adapter; query-term/popular-query
suggestions; search analytics/query-log.

## Decisions (from brainstorming, 2026-06-24)

1. **Product suggestions, not term suggestions** — return lightweight product hits for an
   instant-results dropdown (reuses slice-1 FTS plumbing; no query-log infra). (Q1=A)
2. **Prefix match via `to_tsquery` with `:*`** on a **sanitized token builder** — the last
   token gets `:*`; reuses the K2 GIN index. Raw user text never reaches `to_tsquery`
   (which throws on malformed input). (Q2=A)
3. **Extend the `ProductSearch` interface with `suggest()`** (one provider concern, one
   swappable seam — ADR-009), not a separate provider. (Q3=A)
4. **Suggestion shape `{ id, name, price, salePrice }`** — link by `id` (Product has no
   `slug`); `price`/`salePrice` are `Decimal(12,2)` → returned as strings, `salePrice`
   nullable. No relations, no images. (Q3 confirm)
5. **Dedicated `SuggestProductsDto { q?, limit? }`** — `limit` default 8, `@Min(1) @Max(20)`;
   blank/zero-token `q` → `[]` no DB hit; single raw query returning scalars directly
   (no `findMany` hydrate step). ACTIVE-only, all sellers, ranked. (Q4=A)
6. **Follow-up #1 = share one exported `PRODUCT_INCLUDE`**; **both follow-ups = separate
   tasks/commits** from the autocomplete feature. (Q5)
7. **Follow-up #2 = one e2e spec** (`search-routes.e2e-spec.ts`) covering both static routes
   — the only level that catches the cross-module route-order regression. (Q6=A)

## Architecture

```
apps/api/src/search/
  product-search.ts            # EXTEND: ProductSearch gains suggest(q, limit): Promise<ProductSuggestion[]>;
                               #         add ProductSuggestion type; share PRODUCT_INCLUDE (follow-up #1)
  postgres-product-search.ts   # EXTEND: implement suggest() (single raw query, scalars);
                               #         export pure buildPrefixTsQuery() token builder
  search.controller.ts         # EXTEND: @Public() @Get('suggest')
  dto/suggest-products.dto.ts  # NEW: SuggestProductsDto { q?, limit? }
apps/api/src/products/
  products.service.ts          # FOLLOW-UP #1: export const PRODUCT_INCLUDE (single source of truth)
apps/api/test/
  search-routes.e2e-spec.ts    # FOLLOW-UP #2: /products/search + /products/suggest resolve (200)
```

- `ProductSearch` gains `suggest()`; `PostgresProductSearch` implements both `search` + `suggest`.
  No new module/token/migration. `SearchController` (already `@Controller('products')`,
  already in `SearchModule` imported before `ProductsModule`) gains `@Get('suggest')`.
- `suggest` matches the **same K2 GIN index expression** → no migration.

## Autocomplete data flow — `GET /products/suggest?q=auro&limit=8`

1. **DTO** — `SuggestProductsDto { q?: string @MaxLength(200); limit?: number @Type(()=>Number) @IsInt @Min(1) @Max(20) }`. Invalid → 400.
2. **Controller** — `@Public() @Get('suggest')`; delegate `suggest(query.q ?? '', query.limit ?? 8)`.
3. **`buildPrefixTsQuery(q)` (pure, exported, unit-tested)** —
   - trim; lowercase; split on non-alphanumerics; drop empties → tokens.
   - no tokens → return `null` (caller short-circuits to `[]`).
   - join tokens with ` & `, append `:*` to the **last** token.
   - examples: `"auro"`→`auro:*`; `"aurora sma"`→`aurora & sma:*`; `"  Aurora  X "`→`aurora & x:*`; `"!!!"`/`""`→`null`.
   - safe to pass to `to_tsquery`: built only from sanitized alphanumeric tokens.
4. **Single raw query** (`$1` = the built tsquery string, parameterized; `$2` = limit):
   ```sql
   SELECT p.id, p.name, p.price, p."salePrice",
          ts_rank(
            setweight(to_tsvector('english', p.name), 'A') ||
            setweight(to_tsvector('english', coalesce(p.description,'')), 'B'),
            to_tsquery('english', $1)
          ) AS rank
   FROM "Product" p
   WHERE p."deletedAt" IS NULL AND p.status = 'ACTIVE'
     AND to_tsvector('english', p.name || ' ' || coalesce(p.description,''))
         @@ to_tsquery('english', $1)
   ORDER BY rank DESC, p."createdAt" DESC
   LIMIT $2;
   ```
   - `@@` expression identical to the K2 index → GIN index used.
   - scalars only → no hydrate step.
5. **Map → `ProductSuggestion[]`** — `{ id, name, price, salePrice }` (`price`/`salePrice`
   are strings from Postgres `numeric`; `salePrice` may be `null`). Return the array directly.

## Follow-up #1 — dedupe `PRODUCT_INCLUDE`

- `products.service.ts:32`: `const PRODUCT_INCLUDE` → `export const PRODUCT_INCLUDE` (identical shape, unchanged).
- `search/product-search.ts`: remove the local `PRODUCT_SEARCH_INCLUDE`; import the catalog
  const and re-export under the existing name (`export { PRODUCT_INCLUDE as PRODUCT_SEARCH_INCLUDE }`)
  so `postgres-product-search.ts`'s `import { PRODUCT_SEARCH_INCLUDE }` and the derived
  `ProductSearchItem` keep working. Dependency direction `search → products` (consumer).
- **Behavior-preserving** (value identical today); verified by existing search tests + tsc.

## Follow-up #2 — route-precedence e2e guard

- New `apps/api/test/search-routes.e2e-spec.ts`, mirroring `test/public-sellers.e2e-spec.ts`:
  `Test.createTestingModule({ imports: [AppModule] })` + `supertest`, global `ValidationPipe`.
- Assert `GET /products/search?q=aurora` → **200** and `GET /products/suggest?q=aurora` → **200**
  (regression = 404 from `/products/:id` shadowing). Assertion is route-resolution (status ≠ 404),
  robust to data; uses existing seed (Auroras ACTIVE).
- Fails if anyone reorders `SearchModule`/`ProductsModule` in `app.module.ts`.

## Error handling

- Invalid DTO (`limit` < 1 / > 20 / non-numeric) → 400 (global `ValidationPipe`).
- Blank/whitespace `q`, or `q` that sanitizes to zero tokens (e.g. `"!!!"`) → 200 `[]`, no DB hit.
- `to_tsquery` only ever receives the sanitized token string → no parse-throw; no try/catch needed.
- `@Public`, ACTIVE-only, all sellers.
- Unexpected DB error → 500 (not swallowed).

## Testing

**Unit — `buildPrefixTsQuery()` (pure, the key logic):** `auro`→`auro:*`; `aurora sma`→`aurora & sma:*`;
`  Aurora  X `→`aurora & x:*`; `!!!`→`null`; ``/whitespace→`null`; case-fold; multi-space collapse.

**Unit — `suggest()` (mocked Prisma):** blank/zero-token `q` → `[]`, zero DB calls; non-blank →
`$queryRaw` called with the built tsquery string + limit; rows mapped to `{id,name,price,salePrice}`
incl. `salePrice: null` passthrough; default `limit` applied.

**Unit — controller:** `@Get('suggest')` delegates with resolved defaults (`q ?? ''`, `limit ?? 8`); `@Public`.

**Unit — DTO:** `limit` bounds (reject 0, 21; coerce string→number); `q` optional.

**e2e (follow-up #2):** `search-routes.e2e-spec.ts` — both routes 200.

**Follow-up #1:** no new test (existing search tests + tsc; behavior-preserving).

**HTTP smoke (RULE.md §5, extend the slice-1 smoke):** `/products/suggest` — `q=auro` returns
Aurora products (proves prefix match, the new behavior); `q=aurora sma` narrows; lean shape
`{id,name,price,salePrice}`; ACTIVE-only; `limit` respected; blank → `[]`; GIN index used (EXPLAIN).
Run vs `ecom_dev`.

**Verification gate:** full jest suite green + new e2e green + `tsc --noEmit` clean for `src/search`
(only 3 known pre-existing errors elsewhere) + lint clean + HTTP smoke (incl. prefix match) vs `ecom_dev`.

## Acceptance criteria

- `GET /products/suggest?q=...` returns ranked, ACTIVE-only product suggestions (across all
  sellers) as a lean `{id,name,price,salePrice}[]`, capped at `limit` (default 8, max 20).
- Prefix matching works ("auro" matches "Aurora") — behavior `search` does not have.
- Arbitrary/garbage input never errors (sanitized token builder).
- Blank / zero-token `q` → `[]`.
- `suggest` is on the `ProductSearch` seam (swappable; ES adapter later implements both methods).
- K2 GIN index serves the match.
- `PRODUCT_INCLUDE` declared once and shared (no duplication).
- e2e guard proves both `/products/search` and `/products/suggest` resolve.
- All slice-1 + M0–M3 tests still green.

## Risks

- **`to_tsquery` throw on raw input** → mitigated by building the tsquery only from sanitized
  alphanumeric tokens; `buildPrefixTsQuery` is the single chokepoint, unit-tested for garbage.
- **Route precedence** (a third `/products/*` concern, `suggest`) → the e2e guard (follow-up #2)
  now covers both static routes.
- **Include dedup import cycle** → `search → products` is one-directional (search imports the
  shape; products does not import search); no cycle.
