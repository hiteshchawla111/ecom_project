# M3c Search — Slice 4a: Storefront Faceted Search Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the storefront `/products` page to consume the FTS `/products/search` API with a URL-driven facet sidebar (brand/category/price/rating buckets + counts), switching between browse and search modes.

**Architecture:** Add a `searchProducts`/`getSearchResults` data layer to `lib/catalog.ts` mirroring `listProducts`/`getProducts`. Augment `CatalogFilters` to render facet buckets as navigating links when a `facets` prop is passed. The `/products` Server Component picks browse mode (`getProducts`) or search mode (`getSearchResults`, ranked + facets) per request. All SSR + URL-driven; no client data fetching.

**Tech Stack:** Next.js (App Router, RSC) + TypeScript (strict), Tailwind (DESIGN.md tokens, no hardcoded hex), Vitest + RTL (unit/component), Playwright (e2e, auto-starts dev server). API consumed over HTTP.

## Global Constraints

- Strict TypeScript; no `any`. Match existing `lib/catalog.ts` patterns: `CatalogOptions { baseUrl; fetch? }`, the `toQuery` helper, `CatalogError`, `cache: 'no-store'`, and the `apiBaseUrl()`-injecting wrapper convention (`getProducts` → `listProducts`).
- All rendering SSR + URL-driven (links + the existing GET form). NO client-side data fetching (no `useEffect`/client fetch). Facet selection = navigating to a shareable URL.
- Facet response types MIRROR the API's `SearchFacets` field-for-field: `brands {value,count}[]`, `categories {categoryId,name,count}[]`, `price {min,max}|null` (strings — Postgres numeric), `ratings {minRating,count}[]`.
- Mode switch: `searchMode = !!(q || categoryId || minPrice || maxPrice || brand || minRating)`. Search mode → `getSearchResults` + facet sidebar, sort control HIDDEN. Browse mode → existing `getProducts`, sort shown, no facets.
- Tailwind tokens only (e.g. `text-content`, `border-line`, `bg-primary-500`) — never hardcode hex. Accessibility is a hard requirement: labelled groups, `aria-label` on remove links, keyboard-navigable plain links/anchors.
- Storefront tests mock `fetch`/the data layer — no live API in unit tests. `npm test` = `vitest run`; single file: `npm test -- <pattern>`.
- Verify with `npm run lint` AND `npm run build` (Next type-checks on build) AND a real browser smoke vs `ecom_dev` before "done".
- No `git push` without explicit user permission. Commit locally per task. Run from the worktree root `/Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/.claude/worktrees/feat-search-v2-slice4`; the storefront app is `apps/storefront`.

---

### Task 1: Data layer — `searchProducts` + `getSearchResults` + facet types

**Files:**
- Modify: `apps/storefront/src/lib/catalog.ts`
- Test: `apps/storefront/src/lib/catalog.test.ts` (extend existing)

**Interfaces:**
- Consumes: existing `Product`, `Paginated<T>`, `CatalogOptions`, `toQuery`, `CatalogError`, `apiBaseUrl()`.
- Produces:
  - `interface SearchQuery { q?: string; page?: number; pageSize?: number; categoryId?: string; minPrice?: number; maxPrice?: number; brand?: string; minRating?: number }`
  - `interface SearchFacets { brands: {value:string;count:number}[]; categories: {categoryId:string;name:string;count:number}[]; price: {min:string;max:string}|null; ratings: {minRating:number;count:number}[] }`
  - `interface SearchResult extends Paginated<Product> { facets: SearchFacets }`
  - `searchProducts(query: SearchQuery, opts: CatalogOptions): Promise<SearchResult>`
  - `getSearchResults(query?: SearchQuery): Promise<SearchResult>`

- [ ] **Step 1: Write the failing tests (append to `catalog.test.ts`)**

Inspect the existing `catalog.test.ts` to reuse its mock-fetch helper. The existing tests build a `fetch` mock returning `{ ok, status, json }`; follow that exact pattern. Append:
```typescript
describe('searchProducts', () => {
  const makeFetch = (body: unknown, ok = true, status = 200) =>
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(body),
    }) as unknown as typeof fetch;

  const sampleResult = {
    data: [],
    page: 1,
    pageSize: 12,
    total: 0,
    totalPages: 1,
    facets: {
      brands: [{ value: 'Acme', count: 3 }],
      categories: [{ categoryId: 'c1', name: 'Phones', count: 5 }],
      price: { min: '100.00', max: '900.00' },
      ratings: [{ minRating: 4, count: 2 }],
    },
  };

  it('builds the /products/search URL with q + facet params', async () => {
    const fetchImpl = makeFetch(sampleResult);
    await searchProducts(
      { q: 'phone', page: 2, pageSize: 12, brand: 'Acme', categoryId: 'c1', minPrice: 100, maxPrice: 900, minRating: 4 },
      { baseUrl: 'http://api.test', fetch: fetchImpl },
    );
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('http://api.test/products/search?');
    expect(url).toContain('q=phone');
    expect(url).toContain('brand=Acme');
    expect(url).toContain('categoryId=c1');
    expect(url).toContain('minPrice=100');
    expect(url).toContain('maxPrice=900');
    expect(url).toContain('minRating=4');
    expect(url).toContain('page=2');
  });

  it('returns the parsed SearchResult including facets', async () => {
    const result = await searchProducts(
      { q: 'phone' },
      { baseUrl: 'http://api.test', fetch: makeFetch(sampleResult) },
    );
    expect(result.facets.brands).toEqual([{ value: 'Acme', count: 3 }]);
    expect(result.facets.price).toEqual({ min: '100.00', max: '900.00' });
    expect(result.total).toBe(0);
  });

  it('throws CatalogError on a non-2xx response', async () => {
    await expect(
      searchProducts(
        { q: 'x' },
        { baseUrl: 'http://api.test', fetch: makeFetch({ message: 'bad' }, false, 400) },
      ),
    ).rejects.toBeInstanceOf(CatalogError);
  });
});
```
(Ensure `searchProducts`, `CatalogError` are imported at the top of the test file — extend the existing import.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/storefront && npm test -- catalog.test`
Expected: FAIL — `searchProducts` is not exported.

- [ ] **Step 3: Implement the data layer**

In `apps/storefront/src/lib/catalog.ts`, add the types near `ListProductsQuery`/`Paginated`:
```typescript
/** Search query mirroring the API's /products/search facet surface. */
export interface SearchQuery {
  q?: string;
  page?: number;
  pageSize?: number;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  brand?: string;
  minRating?: number;
}

/** Facet buckets mirroring the API's SearchFacets (counts + price min/max). */
export interface SearchFacets {
  brands: { value: string; count: number }[];
  categories: { categoryId: string; name: string; count: number }[];
  price: { min: string; max: string } | null;
  ratings: { minRating: number; count: number }[];
}

/** Search response: a paginated product page plus facet buckets. */
export interface SearchResult extends Paginated<Product> {
  facets: SearchFacets;
}
```
Add the fetcher near `listProducts` (mirror it exactly):
```typescript
/** Faceted full-text search against /products/search. */
export async function searchProducts(
  query: SearchQuery,
  { baseUrl, fetch: fetchImpl = fetch }: CatalogOptions,
): Promise<SearchResult> {
  const url = `${baseUrl}/products/search${toQuery({
    q: query.q,
    page: query.page,
    pageSize: query.pageSize,
    categoryId: query.categoryId,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    brand: query.brand,
    minRating: query.minRating,
  })}`;
  const res = await fetchImpl(url, { cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new CatalogError(messageFrom(body, res.status), res.status);
  return body as SearchResult;
}
```
Add the wrapper near `getProducts`:
```typescript
/** Faceted search against the configured API. */
export function getSearchResults(query: SearchQuery = {}): Promise<SearchResult> {
  return searchProducts(query, { baseUrl: apiBaseUrl() });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/storefront && npm test -- catalog.test`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/storefront && npm run lint
cd ../.. && git add apps/storefront/src/lib/catalog.ts apps/storefront/src/lib/catalog.test.ts
git commit -m "feat(m3c): storefront searchProducts + getSearchResults data layer"
```

---

### Task 2: Augment `CatalogFilters` with facet buckets

**Files:**
- Modify: `apps/storefront/src/components/catalog/CatalogFilters.tsx`
- Test: `apps/storefront/src/components/catalog/CatalogFilters.test.tsx` (extend existing)

**Interfaces:**
- Consumes: `SearchFacets` from `@/lib/catalog` (Task 1); existing `CatalogFilterValues`.
- Produces: `CatalogFilters` accepts optional `facets?: SearchFacets` and `searchMode?: boolean`. When `facets` present, renders brand buckets + rating "& up" buckets as navigating links with counts + active/remove state, and hides the sort control. A new exported pure helper `buildFacetHref(current, key, value)` builds the URL (preserves other params, resets page to 1); `key: 'brand' | 'minRating'`, `value: string | number | null` (null removes).

> **URL/active-state model:** facet links use the same param names the page parses (`q`, `category`, `minPrice`, `maxPrice`, `brand`, `minRating`, `page`). `buildFacetHref` takes the current `CatalogFilterValues` (extended with `brand`/`minRating`/`q`), sets/clears one facet, resets `page`, and returns `/products?<qs>`. A `null` value removes that facet (the ×-remove link).

- [ ] **Step 1: Extend `CatalogFilterValues` + write failing tests**

First extend `CatalogFilterValues` in `CatalogFilters.tsx` to carry the search params (so facet hrefs can preserve them):
```typescript
export interface CatalogFilterValues {
  search?: string;
  q?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  brand?: string;
  minRating?: number;
  sortBy?: ProductSortBy;
  sortDir?: SortDir;
}
```
Append tests to `CatalogFilters.test.tsx` (reuse its existing render helper / RTL setup):
```typescript
import type { SearchFacets } from '@/lib/catalog';

const facets: SearchFacets = {
  brands: [
    { value: 'Acme', count: 3 },
    { value: 'Beta', count: 1 },
  ],
  categories: [{ categoryId: 'c1', name: 'Phones', count: 5 }],
  price: { min: '100.00', max: '900.00' },
  ratings: [
    { minRating: 4, count: 2 },
    { minRating: 3, count: 4 },
  ],
};

describe('CatalogFilters facets', () => {
  it('renders brand buckets with counts as links when facets are passed', () => {
    render(<CatalogFilters categories={[]} current={{ q: 'phone' }} facets={facets} />);
    const acme = screen.getByRole('link', { name: /Acme/ });
    expect(acme).toHaveTextContent('3');
    expect(acme.getAttribute('href')).toContain('brand=Acme');
    expect(acme.getAttribute('href')).toContain('q=phone');
  });

  it('renders rating "& up" buckets with counts', () => {
    render(<CatalogFilters categories={[]} current={{ q: 'phone' }} facets={facets} />);
    const r4 = screen.getByRole('link', { name: /4.*up/i });
    expect(r4.getAttribute('href')).toContain('minRating=4');
  });

  it('shows a remove link for the active brand facet', () => {
    render(<CatalogFilters categories={[]} current={{ q: 'phone', brand: 'Acme' }} facets={facets} />);
    const remove = screen.getByRole('link', { name: /remove .*Acme/i });
    expect(remove.getAttribute('href')).not.toContain('brand=Acme');
  });

  it('hides the sort control in search mode (facets present)', () => {
    render(<CatalogFilters categories={[]} current={{ q: 'phone' }} facets={facets} />);
    expect(screen.queryByLabelText('Sort')).toBeNull();
  });

  it('renders unchanged (with Sort) when no facets are passed', () => {
    render(<CatalogFilters categories={[]} current={{}} />);
    expect(screen.getByLabelText('Sort')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Acme/ })).toBeNull();
  });
});
```
(Ensure `render`/`screen` come from the test file's existing `@testing-library/react` import.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/storefront && npm test -- CatalogFilters.test`
Expected: FAIL — `facets` prop unsupported; brand links absent.

- [ ] **Step 3: Implement the facet rendering**

In `CatalogFilters.tsx`:
1. Import the type: `import type { Category, ProductSortBy, SortDir, SearchFacets } from '@/lib/catalog';`
2. Add a pure exported helper (above the component):
```typescript
/** Build a /products URL with one facet set or cleared, preserving other
 *  params and resetting page. `value === null` removes the facet. */
export function buildFacetHref(
  current: CatalogFilterValues,
  key: 'brand' | 'minRating',
  value: string | number | null,
): string {
  const params = new URLSearchParams();
  if (current.q) params.set('q', current.q);
  if (current.categoryId) params.set('category', current.categoryId);
  if (current.minPrice !== undefined) params.set('minPrice', String(current.minPrice));
  if (current.maxPrice !== undefined) params.set('maxPrice', String(current.maxPrice));
  // carry the OTHER facet (the one not being changed)
  if (key !== 'brand' && current.brand) params.set('brand', current.brand);
  if (key !== 'minRating' && current.minRating !== undefined) {
    params.set('minRating', String(current.minRating));
  }
  if (value !== null) params.set(key === 'brand' ? 'brand' : 'minRating', String(value));
  return `/products?${params.toString()}`;
}
```
3. Update the signature + props interface:
```typescript
interface CatalogFiltersProps {
  categories: Category[];
  current?: CatalogFilterValues;
  facets?: SearchFacets;
}

export function CatalogFilters({ categories, current, facets }: CatalogFiltersProps) {
```
4. Render the sort control conditionally — wrap the existing Sort `<div>` in `{!facets && ( … )}`.
5. After the closing `</form>`, when `facets` is present, render the facet sidebar (wrap form + facets in a `<>…</>` fragment). Use Tailwind tokens only:
```tsx
      {facets && (
        <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 shadow-sm">
          {facets.brands.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className={labelClass}>Brand</legend>
              <ul className="flex flex-col gap-1">
                {facets.brands.map((b) => {
                  const active = current?.brand === b.value;
                  return (
                    <li key={b.value} className="flex items-center justify-between gap-2 text-sm">
                      <Link
                        href={buildFacetHref(current ?? {}, 'brand', active ? null : b.value)}
                        aria-current={active ? 'true' : undefined}
                        className={`hover:underline ${active ? 'font-semibold text-primary-700' : 'text-content'}`}
                      >
                        {b.value} ({b.count})
                      </Link>
                      {active && (
                        <Link
                          href={buildFacetHref(current ?? {}, 'brand', null)}
                          aria-label={`Remove ${b.value} brand filter`}
                          className="text-content-subtle hover:text-content"
                        >
                          ×
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}
          {facets.ratings.some((r) => r.count > 0) && (
            <fieldset className="flex flex-col gap-2">
              <legend className={labelClass}>Rating</legend>
              <ul className="flex flex-col gap-1">
                {facets.ratings.map((r) => {
                  const active = current?.minRating === r.minRating;
                  return (
                    <li key={r.minRating} className="flex items-center justify-between gap-2 text-sm">
                      <Link
                        href={buildFacetHref(current ?? {}, 'minRating', active ? null : r.minRating)}
                        aria-current={active ? 'true' : undefined}
                        className={`hover:underline ${active ? 'font-semibold text-primary-700' : 'text-content'}`}
                      >
                        {r.minRating} ★ &amp; up ({r.count})
                      </Link>
                      {active && (
                        <Link
                          href={buildFacetHref(current ?? {}, 'minRating', null)}
                          aria-label={`Remove ${r.minRating} star and up rating filter`}
                          className="text-content-subtle hover:text-content"
                        >
                          ×
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}
        </div>
      )}
```
(Wrap the existing `<form>…</form>` and this block together: change the component's single returned `<form>` into `return ( <> <form …>…</form> {facets && (…)} </> );`.)

> Note: the form's `search` input keeps `name="search"`; in search mode the page reads `q`. Keep the input's `name="search"` for browse, but also set its `defaultValue={current?.q ?? current?.search ?? ''}` so the box reflects the active query in both modes. The page maps `search`→`q` for the search-mode query (Task 3).

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/storefront && npm test -- CatalogFilters.test`
Expected: PASS (existing + 5 new).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/storefront && npm run lint
cd ../.. && git add apps/storefront/src/components/catalog/CatalogFilters.tsx apps/storefront/src/components/catalog/CatalogFilters.test.tsx
git commit -m "feat(m3c): CatalogFilters facet buckets (brand/rating) + buildFacetHref"
```

---

### Task 3: Wire the `/products` page mode-switch

**Files:**
- Modify: `apps/storefront/src/app/products/page.tsx`
- Test: `apps/storefront/src/app/products/page.test.tsx` (extend existing)

**Interfaces:**
- Consumes: `getSearchResults`/`SearchResult`/`SearchQuery` (Task 1); `CatalogFilters` with `facets` (Task 2); existing `getProducts`, `getCategoryTree`, `ProductCard`, `Pagination`.
- Produces: `/products` renders browse mode (existing) or search mode (ranked + facets) based on the params.

> The existing `page.test.tsx` mocks `@/lib/catalog`. Extend that mock to also stub `getSearchResults`. Determine the exact mock style from the existing file and match it.

- [ ] **Step 1: Write the failing page tests (extend `page.test.tsx`)**

Match the existing mock setup (it already `vi.mock('@/lib/catalog', …)`). Add `getSearchResults` to that mock and append:
```typescript
it('uses search mode (facets + getSearchResults) when q is present', async () => {
  // Arrange the catalog mock: getSearchResults returns a result with facets.
  mockGetSearchResults.mockResolvedValue({
    data: [], page: 1, pageSize: 12, total: 0, totalPages: 1,
    facets: { brands: [{ value: 'Acme', count: 2 }], categories: [], price: null, ratings: [] },
  });
  const ui = await ProductsPage({ searchParams: Promise.resolve({ search: 'phone' }) });
  render(ui);
  expect(mockGetSearchResults).toHaveBeenCalled();
  expect(mockGetProducts).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: /Acme/ })).toBeInTheDocument(); // facet sidebar shown
});

it('uses browse mode (getProducts, no facets) when there is no query or filter', async () => {
  mockGetProducts.mockResolvedValue({ data: [], page: 1, pageSize: 12, total: 0, totalPages: 1 });
  const ui = await ProductsPage({ searchParams: Promise.resolve({}) });
  render(ui);
  expect(mockGetProducts).toHaveBeenCalled();
  expect(mockGetSearchResults).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Sort')).toBeInTheDocument(); // sort shown in browse mode
});

it('uses search mode when only a facet filter (brand) is present', async () => {
  mockGetSearchResults.mockResolvedValue({
    data: [], page: 1, pageSize: 12, total: 0, totalPages: 1,
    facets: { brands: [], categories: [], price: null, ratings: [] },
  });
  await ProductsPage({ searchParams: Promise.resolve({ brand: 'Acme' }) });
  expect(mockGetSearchResults).toHaveBeenCalledWith(
    expect.objectContaining({ brand: 'Acme', page: 1, pageSize: 12 }),
  );
});
```
(Use the test file's existing mock variable names; if it imports the mocked fns differently, adapt these three tests to that style — the assertions are the contract: search vs browse selection, facet sidebar presence, sort visibility.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/storefront && npm test -- "products/page.test"`
Expected: FAIL — page always calls `getProducts`; no `getSearchResults`/facets.

- [ ] **Step 3: Implement the mode-switch**

In `apps/storefront/src/app/products/page.tsx`:
1. Extend imports from `@/lib/catalog`: add `getSearchResults`, `type SearchQuery`, `type SearchResult`. Add `brand`/`minRating` to `RawParams`.
2. Add a rating parser near `parsePrice`:
```typescript
/** Coerce a raw rating param to an integer 1..5, else undefined. */
function parseRating(raw: string | string[] | undefined): number | undefined {
  const v = first(raw);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined;
}
```
3. Rework the data section of `ProductsPage` (replace the `buildQuery`/`getProducts` block). Keep `buildQuery` for browse mode; add search-mode branching:
```typescript
  const raw = await searchParams;
  const page = parsePage(raw.page);

  const q = first(raw.search);
  const categoryId = first(raw.category);
  const minPrice = parsePrice(raw.minPrice);
  const maxPrice = parsePrice(raw.maxPrice);
  const brand = first(raw.brand);
  const minRating = parseRating(raw.minRating);
  const { sortBy, sortDir } = parseSort(raw.sort);

  const searchMode = Boolean(q || categoryId || minPrice !== undefined || maxPrice !== undefined || brand || minRating !== undefined);

  const categoriesPromise = getCategoryTree();

  let data: Product[];
  let total: number;
  let totalPages: number;
  let facets: SearchFacets | undefined;

  if (searchMode) {
    const query: SearchQuery = { q, page, pageSize: PAGE_SIZE, categoryId, minPrice, maxPrice, brand, minRating };
    const result = await getSearchResults(query);
    ({ data, total, totalPages, facets } = result);
  } else {
    const result = await getProducts({ search: q, categoryId, minPrice, maxPrice, sortBy, sortDir, page, pageSize: PAGE_SIZE });
    ({ data, total, totalPages } = result);
  }
  const categories = await categoriesPromise;

  const values: CatalogFilterValues = { search: q, q, categoryId, minPrice, maxPrice, brand, minRating, sortBy, sortDir };
```
(Add `Product`, `SearchFacets` to the `@/lib/catalog` type imports.)
4. Update the JSX: pass `facets` to `CatalogFilters`:
```tsx
      <CatalogFilters categories={categories} current={values} facets={facets} />
```
5. Update `filterQueryString` to also carry `q`, `brand`, `minRating` so pagination links preserve the active search:
```typescript
function filterQueryString(values: CatalogFilterValues, page: number): string {
  const params = new URLSearchParams();
  if (values.q) params.set('search', values.q);
  else if (values.search) params.set('search', values.search);
  if (values.categoryId) params.set('category', values.categoryId);
  if (values.minPrice !== undefined) params.set('minPrice', String(values.minPrice));
  if (values.maxPrice !== undefined) params.set('maxPrice', String(values.maxPrice));
  if (values.brand) params.set('brand', values.brand);
  if (values.minRating !== undefined) params.set('minRating', String(values.minRating));
  if (!values.brand && !values.minRating && !values.q && !values.categoryId && values.sortBy && values.sortDir) {
    params.set('sort', `${values.sortBy}:${values.sortDir}`);
  }
  params.set('page', String(page));
  return `?${params.toString()}`;
}
```
6. The empty-state message stays; in search mode it still renders with the facet sidebar above it (the `CatalogFilters` with `facets` is rendered before the grid regardless). Remove the now-unused `buildQuery` if it's fully replaced, or keep it only if still referenced (delete dead code).

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/storefront && npm test -- "products/page.test"`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/storefront && npm run lint
cd ../.. && git add apps/storefront/src/app/products/page.tsx apps/storefront/src/app/products/page.test.tsx
git commit -m "feat(m3c): /products mode-switch — FTS search + facets vs browse"
```

---

### Task 4: Full gate — suite, lint, build, browser smoke

**Files:** none (verification only).

- [ ] **Step 1: Full Vitest suite + lint + build**

```bash
cd apps/storefront
npm test                # all green (existing 216 + new)
npm run lint            # clean
npm run build           # succeeds (Next type-checks)
```
Expected: suite green; lint clean; build succeeds. If `build` surfaces a type error the unit run didn't, fix it (Next type-checks the whole app on build).

- [ ] **Step 2: Browser smoke vs `ecom_dev` (RULE.md §5)**

Start the API and storefront against the real DB:
```bash
# Terminal A — API (from the API worktree or this one's apps/api if present; the API is on main @ 128624d)
# Ensure API is running on :5000 against ecom_dev (npm run start:dev in an apps/api with .env).
# Terminal B — storefront
cd apps/storefront && npm run dev   # :5001
```
Then verify in a browser (or `curl` the rendered HTML / use Playwright):
- `http://localhost:5001/products` → browse-all catalog renders (regression check; sort control visible).
- `http://localhost:5001/products?search=aurora` → ranked results + facet sidebar with real counts (brand "Aurora"); sort control hidden.
- Click a brand facet → URL gains `brand=…`, results narrow, other brands still listed with counts (disjunctive), active brand shows a remove (×) link.
- A rating "& up" link filters; category/price still work and keep search mode.
- `http://localhost:5001/products?search=zzzzzz` → "No products match" message with the sidebar still present.
Record the observations. If anything fails, fix and re-verify.

- [ ] **Step 3: (Optional) Playwright e2e for the search→facet flow**

If cheap, add `apps/storefront/e2e/search-facets.spec.ts` mirroring an existing e2e spec's structure: load `/products?search=aurora`, assert results + a brand facet link exist, click it, assert the URL contains `brand=`. Run `npm run test:e2e -- search-facets`. If the e2e harness setup is heavy, skip in favor of the documented manual browser smoke (Step 2) and note it.

- [ ] **Step 4: Commit any fixes**

```bash
cd .. && git add -A apps/storefront
git commit -m "test(m3c): storefront faceted-search smoke fixes" --allow-empty
```
(Use `--allow-empty` only if Step 1–3 required no code changes, to mark the gate passed; otherwise commit the real fixes.)

---

### Task 5: Update the roadmap status

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md` (M3c note)

- [ ] **Step 1: Update the M3c marker + note**

In `docs/IMPLEMENTATION_PLAN.md`, change `M3c 🟡 (slices 1–3 done)` → `M3c 🟡 (slices 1–3 + 4a done)`, and append after the slice-3 sentence:
*"**Slice 4a (storefront faceted search page) ✅ (branch `worktree-feat-search-v2-slice4`)** — `/products` evolved onto the FTS `/products/search` API: browse-all by default, ranked results + a URL-driven facet sidebar (brand/rating buckets with disjunctive counts + active/remove links, augmenting `CatalogFilters`) once a `q` or any facet filter is present; sort hidden in search mode. New `searchProducts`/`getSearchResults` data layer + `SearchFacets` types. Vitest units (data layer, facet rendering, page mode-switch) + browser-smoked vs `ecom_dev`. **Next M3c slice:** (4b) client autocomplete search box (debounced `/products/suggest`)."*

- [ ] **Step 2: Commit**

```bash
git add docs/IMPLEMENTATION_PLAN.md
git commit -m "docs(m3c): mark search slice 4a (storefront faceted search) done"
```

---

## Self-Review

**Spec coverage:**
- Data layer `searchProducts`/`getSearchResults` + facet types → Task 1. ✅
- `CatalogFilters` facet buckets (brand/rating) + counts + active/remove + hide sort → Task 2. ✅
- `/products` mode-switch (search vs browse), facets rendered, sort hidden in search → Task 3. ✅
- URL-driven SSR (links, `buildFacetHref`, preserve params, page reset) → Task 2 helper + Task 3 `filterQueryString`. ✅
- Mode-switch rule (q or any facet filter) → Task 3 `searchMode`. ✅
- Error/empty handling (friendly error, empty + sidebar) → existing try/catch path + empty-state retained (Task 3). ✅
- A11y (labelled groups, aria-label remove, keyboard links) → Task 2 markup. ✅
- Tests: Vitest units (data, component, page) + browser smoke → Tasks 1,2,3,4. ✅
- Verification gate (suite + lint + build + smoke) → Task 4. ✅

**Placeholder scan:** No TBD/TODO; every code step shows code. Tasks 2/3 note "match the existing test/mock style" with the assertion contract spelled out — that's adapting to real existing scaffolding the implementer must read, not a placeholder (the required behavior is concrete). ✅

**Type consistency:** `SearchQuery`/`SearchFacets`/`SearchResult` identical across Tasks 1→2→3. `searchProducts(query, opts)`/`getSearchResults(query?)` consistent. `buildFacetHref(current, key, value)` signature consistent Task 2 ↔ usage. `CatalogFilterValues` extended once (Task 2) with `q`/`brand`/`minRating`, used in Task 3. `facets?: SearchFacets` prop consistent Task 2 ↔ Task 3. `searchMode` boolean rule matches the spec verbatim. ✅
