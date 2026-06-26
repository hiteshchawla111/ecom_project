# M3c Search — Slice 4a: Storefront Faceted Search Page (Design)

> **Date:** 2026-06-24 · **Phase:** M3c (Search), storefront · **Branch/worktree:** `worktree-feat-search-v2-slice4` (off `main` @ `128624d`)
> **Status:** Approved design. Implementation follows RULE.md (TDD; one slice; smoke-run the real thing).
> **Builds on:** M3c API slices 1–3 (FTS `/products/search` + facets, `/products/suggest`), all merged to `main`. Reads with the slice-1/2/3 design docs and `docs/IMPLEMENTATION_PLAN.md` (M3c).

## Objective

Evolve the storefront `/products` page to consume the FTS search API with a faceted
filter sidebar: ranked results + brand/category/price/rating facet buckets with counts,
URL-driven and server-rendered. The autocomplete dropdown is **slice 4b** (deferred).

## Scope decomposition

"Storefront search UI" (M3c slice 4) is multi-surface and was decomposed:
- **4a (this spec):** data layer + SSR faceted search results page.
- **4b (next):** client-interactive autocomplete search box (debounced `/products/suggest`).

## Scope (4a)

**In scope**
- `lib/catalog.ts`: `searchProducts()` + `getSearchResults()` + `SearchQuery`/`SearchResult`/`SearchFacets` types.
- `components/catalog/CatalogFilters.tsx`: render facet buckets (brand list, rating "& up") + counts + active/removable selection when `facets` passed (browse mode unchanged).
- `app/products/page.tsx`: mode-switch (browse vs search), render facets in search mode, hide sort in search mode.

**Out of scope**
- Autocomplete dropdown / header search box (slice 4b).
- A separate `/search` route (we evolve `/products`).
- Multi-select facets (single-select; matches the slice-3 API).
- Client-side data fetching (everything stays SSR).

## Decisions (from brainstorming, 2026-06-24)

1. **Sub-slice 4a = faceted results page first** (data layer + SSR page); autocomplete → 4b.
2. **Evolve `/products`** (not a new `/search` route): browse-all by default; FTS+facets once there's a `q` or any facet filter. (Q1=A)
3. **Dedicated `searchProducts` + `getSearchResults`** mirroring `listProducts`/`getProducts`; `SearchFacets` types mirror the API field-for-field. (Q2=A)
4. **URL-driven SSR; augment `CatalogFilters`** with facet buckets; facet values are navigating links (single-select, preserve other params, page→1). (Q3=A)
5. **Mode switch:** `q` OR any of `brand`/`categoryId`/`minPrice`/`maxPrice`/`minRating` → search mode; else browse mode. `sort` is browse-only, hidden/ignored in search mode (FTS rank-orders). (Q4)
6. **Test split:** Vitest+RTL units (mocked fetch/data) + real browser smoke vs `ecom_dev`. (Q4)

## Architecture

```
apps/storefront/src/
  lib/catalog.ts                         # EXTEND: searchProducts() + getSearchResults() + SearchQuery/SearchResult/SearchFacets
  components/catalog/CatalogFilters.tsx   # EXTEND: facet buckets (brand, rating "& up") + counts + active/remove links when `facets` passed
  app/products/page.tsx                   # EVOLVE: mode-switch; render facets; hide sort in search mode
  (+ co-located *.test.ts(x))
```

- Reuses `ProductCard`, `Pagination` unchanged; reuses `toQuery`/`CatalogError`/injected `fetch`+`baseUrl` from `lib/catalog.ts`.
- `CatalogFilters` augmented (optional `facets` prop), not replaced. URL-driven (links + existing GET form); no client JS.

## Data layer (`lib/catalog.ts`)

```typescript
SearchQuery  = { q?: string; page?: number; pageSize?: number; categoryId?: string;
                 minPrice?: number; maxPrice?: number; brand?: string; minRating?: number }
SearchFacets = {
  brands:     { value: string; count: number }[];
  categories: { categoryId: string; name: string; count: number }[];
  price:      { min: string; max: string } | null;   // strings (Postgres numeric)
  ratings:    { minRating: number; count: number }[];
}
SearchResult = Paginated<Product> & { facets: SearchFacets }

searchProducts(query: SearchQuery, opts: CatalogOptions): Promise<SearchResult>  // GET /products/search?… via toQuery
getSearchResults(query: SearchQuery): Promise<SearchResult>                       // wrapper injecting env baseUrl (like getProducts)
```
`searchProducts` reuses `toQuery`/`CatalogError`/`cache: 'no-store'` exactly like `listProducts`.

## Page data flow (`app/products/page.tsx`)

1. Parse params (existing `first`/`parsePage`/`parsePrice` helpers + new `brand` string, `minRating` 1–5 coerced like `parsePrice`).
2. `searchMode = !!(q || categoryId || minPrice || maxPrice || brand || minRating)`.
3. **Search mode:** `getSearchResults({ q, page, pageSize, categoryId, minPrice, maxPrice, brand, minRating })` → `ProductCard` grid (rank order) + `Pagination` + `CatalogFilters` with `facets` (sort hidden). Empty results → "no products match" message, facets still shown.
4. **Browse mode:** existing `getProducts(...)` path unchanged → grid + `Pagination` + `CatalogFilters` (no `facets`, sort shown).
5. Fetched in the Server Component; try/catch → existing friendly catalog-error UI.
6. Facet links: `hrefForFacet(key, value)` = current params + that facet, `page` reset to 1; active value renders a ×-remove link dropping just that param.

## `CatalogFilters` facet rendering

- New optional `facets?: SearchFacets` prop. When present:
  - **Brands:** each `{value,count}` → link `?…&brand=<value>` "Acme (12)"; active shown selected with ×-remove. Omitted if empty.
  - **Rating:** each `{minRating,count}` → "★ & up (n)" link `?…&minRating=<t>`; active selected/removable. Omitted if all-zero/empty.
  - **Category counts:** annotate the existing category-select options ("Phones (18)") when facet data present (nice-to-have, data is there).
  - **Price:** existing min/max inputs unchanged (keep search mode on).
- When absent → unchanged browse filters. Stays URL-driven (no client JS).

## Error / edge handling

- API/network failure (either mode) → caught in the Server Component → existing friendly catalog-error UI (no crash).
- Empty search results → "No products match" + facet sidebar still shown (user can remove a filter); `total: 0` handled.
- Blank `q` + no filters → browse mode (never hits the API's blank-q-empty behavior).
- `brand`/`minRating` params validated/coerced on parse (ignore garbage, like `parsePrice`).
- Accessibility (hard requirement): facet groups as labelled lists; active/remove links have clear `aria-label`s; counts in link text; keyboard-navigable plain links.

## Testing

**Unit (Vitest + RTL, mocked fetch/data):**
- `searchProducts`/`getSearchResults` (`catalog.test.ts`): correct `/products/search?…` URL from `SearchQuery`; parses `SearchResult` incl. `facets`; throws `CatalogError` on non-2xx; `cache: 'no-store'`.
- `CatalogFilters` (`CatalogFilters.test.tsx`, extend): with `facets` → brand buckets + counts + correct hrefs, rating "& up", active selection has remove link, empty buckets omitted, a11y labels; without `facets` → unchanged (existing tests green).
- `/products` page (`page.test.tsx`, extend): mode-switch (q/facet → `getSearchResults` + facets + sort hidden; none → `getProducts` browse + sort shown); empty search → "no results" + facets; error path → friendly error.

**Browser smoke (RULE.md §5):** API (`:5000`) + storefront (`:5001`) vs `ecom_dev`:
- `/products` (no query) → browse-all catalog (regression).
- `/products?q=aurora` → ranked results + facet sidebar with real counts.
- Click a brand facet → URL gains `brand=…`, results narrow, other brands' counts still shown (disjunctive), active removable.
- Rating "& up" filters; price/category keep search mode.
- `q=zzzz` → "no results" + sidebar.
- Optional Playwright spec for the search→facet flow; else manual browser verification.

**Verification gate:** Vitest suite green (existing 216 + new), `npm run lint` clean, `npm run build` succeeds (Next type-check), browser smoke passes vs `ecom_dev`.

## Acceptance criteria

- `/products` shows browse-all by default; ranked FTS results + facet sidebar once `q` or any facet filter is present.
- Facet sidebar shows brand/category/price/rating buckets with counts; selecting a value navigates to a shareable URL and narrows results; disjunctive counts show alternatives; active selections removable.
- Sort hidden in search mode; shown in browse mode.
- Empty results render a message with the sidebar intact; failures render the friendly error.
- Everything SSR + URL-driven; no client data fetching. A11y preserved.
- Existing catalog/browse behavior unchanged (regression-free).

## Risks

- **Mode-switch regressions** to the existing `/products` browse path → page tests cover both modes; browser smoke checks browse-all still works.
- **Facet href construction** (preserving params, page reset, remove links) is the fiddly part → unit-test `hrefForFacet` behavior via `CatalogFilters` rendering.
- **Response-shape drift** vs the API `SearchFacets` → mirror field names exactly; types anchor the contract.
