# M3a Catalog V2 — Slice 3: `/seller/[slug]` Storefront Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public seller storefront page at `/seller/[slug]` showing the seller's profile header and a paginated grid of their ACTIVE products, lighting up the Slice 2 "Sold by" link.

**Architecture:** Add a storefront `Seller` type and four catalog-client functions (`getSeller`/`getSellerBySlug` mirroring `getCategory`; `listSellerProducts`/`getSellerProducts` for the `GET /sellers/:slug/products` endpoint). Build the `/seller/[slug]` Server Component by mirroring the existing category-detail page (`apps/storefront/src/app/categories/[slug]/page.tsx`): fetch the profile first (404 → `notFound()`), then the paginated products; reuse the `Pagination`, `ProductCard`, grid, and container patterns verbatim.

**Tech Stack:** Next.js (App Router) + TypeScript, Vitest + React Testing Library, Tailwind CSS with `DESIGN.md` tokens.

**Spec:** `docs/superpowers/specs/2026-06-24-m3a-slice3-storefront-seller-page-design.md`

## Global Constraints

- Strict TypeScript; no `any`.
- The page is a server component (NO `'use client'`) — mirrors the category-detail page.
- New `Seller` type = `{ id: string; displayName: string; slug: string; description: string | null; logoUrl: string | null }`. Distinct from the existing `ProductSeller` (`{ displayName, slug }`); both coexist.
- Reuse existing `catalog.ts` helpers: `CatalogOptions`, `apiBaseUrl()`, `toQuery`, `CatalogError`, `messageFrom`, `Paginated<T>`. Do NOT duplicate them.
- `getSeller` returns `null` on 404, throws `CatalogError` on other non-ok (mirrors `getCategory`).
- `listSellerProducts` hits `${baseUrl}/sellers/${slug}/products` with `page`/`pageSize` query params (slug in PATH).
- Page: fetch profile via `getSellerBySlug` FIRST; if `null` → `notFound()`. Fetch products only after a non-null seller. `PAGE_SIZE = 12`.
- Logo `<img>` rendered ONLY when `logoUrl` is present; use the `{/* eslint-disable-next-line @next/next/no-img-element */}` convention from `ProductCard.tsx:42`; `alt = `${displayName} logo``.
- Tailwind classes only from existing `DESIGN.md` tokens — never hardcode hex. Reuse the category page's container `mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10`, grid `grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4`, and `<li key={...} className="flex">` wrapper.
- Shareable pagination URLs: `hrefForPage={(p) => `/seller/${slug}?page=${p}`}`.
- Run storefront commands from `apps/storefront`. Test runner: `npm test` (Vitest run); single: `npm test -- <pattern>`. Lint: `npm run lint`. Build: `npm run build`. Dev port `:5001`; API `:5000`.
- Commit messages end with a blank line then:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Do NOT `git push` (RULE.md §3).

---

## File Structure

- **Modify** `apps/storefront/src/lib/catalog.ts` — add `Seller` interface + `getSeller`/`getSellerBySlug` + `listSellerProducts`/`getSellerProducts`.
- **Modify** `apps/storefront/src/lib/catalog.test.ts` — tests for `getSeller` + `listSellerProducts` (mirror the `getCategory`/`listProducts` tests).
- **Create** `apps/storefront/src/app/seller/[slug]/page.tsx` — the seller storefront page (Server Component).

---

## Task 1: Catalog client — `Seller` type + `getSeller` + `listSellerProducts` (+ server wrappers)

**Files:**
- Modify: `apps/storefront/src/lib/catalog.ts`
- Test: `apps/storefront/src/lib/catalog.test.ts`

**Interfaces:**
- Consumes: existing `CatalogOptions`, `apiBaseUrl`, `toQuery`, `CatalogError`, `messageFrom`, `Paginated<T>`, `Product`.
- Produces:
  - `export interface Seller { id: string; displayName: string; slug: string; description: string | null; logoUrl: string | null }`
  - `export async function getSeller(slug: string, opts: CatalogOptions): Promise<Seller | null>`
  - `export function getSellerBySlug(slug: string): Promise<Seller | null>`
  - `export async function listSellerProducts(slug: string, query: { page?: number; pageSize?: number }, opts: CatalogOptions): Promise<Paginated<Product>>`
  - `export function getSellerProducts(slug: string, query?: { page?: number; pageSize?: number }): Promise<Paginated<Product>>`

- [ ] **Step 1: Write the failing tests**

In `apps/storefront/src/lib/catalog.test.ts`, add `getSeller` and `listSellerProducts` to the existing import from `./catalog` (alongside `getCategory`, `getProduct`, etc.), and add the `Seller` type import. Then add these two `describe` blocks (place them near the existing `getCategory` describe). Reuse the existing `jsonResponse`, `opts`, and `sampleProduct` helpers already in the file:

```typescript
const sampleSeller = {
  id: 's1',
  displayName: 'Demo Shop',
  slug: 'demo-shop',
  description: 'We sell demo things',
  logoUrl: null,
};

describe('getSeller', () => {
  it('requests /sellers/:slug and returns the seller', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, sampleSeller));

    const res = await getSeller('demo-shop', { ...opts, fetch: fetchMock });

    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/sellers/demo-shop');
    expect(res?.slug).toBe('demo-shop');
    expect(res?.displayName).toBe('Demo Shop');
  });

  it('returns null on a 404', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(404, { message: 'Seller not found' }));

    await expect(
      getSeller('nope', { ...opts, fetch: fetchMock }),
    ).resolves.toBeNull();
  });

  it('throws CatalogError on a non-404 error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { message: 'boom' }));

    await expect(
      getSeller('demo-shop', { ...opts, fetch: fetchMock }),
    ).rejects.toBeInstanceOf(CatalogError);
  });
});

describe('listSellerProducts', () => {
  it('requests /sellers/:slug/products with pagination params and returns the envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: [sampleProduct],
        page: 2,
        pageSize: 12,
        total: 13,
        totalPages: 2,
      }),
    );

    const res = await listSellerProducts(
      'demo-shop',
      { page: 2, pageSize: 12 },
      { ...opts, fetch: fetchMock },
    );

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('http://api.test/sellers/demo-shop/products');
    expect(url).toContain('page=2');
    expect(url).toContain('pageSize=12');
    expect(res.data).toHaveLength(1);
    expect(res.total).toBe(13);
  });

  it('omits undefined pagination params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: [],
        page: 1,
        pageSize: 12,
        total: 0,
        totalPages: 1,
      }),
    );

    await listSellerProducts('demo-shop', {}, { ...opts, fetch: fetchMock });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe('http://api.test/sellers/demo-shop/products');
  });
});
```

> Note: `CatalogError` and `sampleProduct` are already imported/defined in `catalog.test.ts`; only add `getSeller`, `listSellerProducts` (and the `Seller` type if you assert against it) to the imports.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix apps/storefront test -- catalog`
Expected: FAIL — `getSeller`/`listSellerProducts` are not exported (import error / not a function).

- [ ] **Step 3: Write minimal implementation**

In `apps/storefront/src/lib/catalog.ts`:

Add the `Seller` interface near the other interfaces (e.g. after `ProductSeller`):

```typescript
/** Public seller profile (storefront seller page). Mirrors GET /sellers/:slug. */
export interface Seller {
  id: string;
  displayName: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
}
```

Add `getSeller` next to `getCategory` (mirror it exactly):

```typescript
/** Fetch a public seller profile by slug; null on 404, throws on other errors. */
export async function getSeller(
  slug: string,
  { baseUrl, fetch: fetchImpl = fetch }: CatalogOptions,
): Promise<Seller | null> {
  const res = await fetchImpl(`${baseUrl}/sellers/${slug}`, {
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new CatalogError(messageFrom(body, res.status), res.status);
  return body as Seller;
}
```

Add `listSellerProducts` next to `listProducts` (slug in path, reuse `toQuery`):

```typescript
/** List a seller's ACTIVE products (paginated). Mirrors GET /sellers/:slug/products. */
export async function listSellerProducts(
  slug: string,
  query: { page?: number; pageSize?: number },
  { baseUrl, fetch: fetchImpl = fetch }: CatalogOptions,
): Promise<Paginated<Product>> {
  const url = `${baseUrl}/sellers/${slug}/products${toQuery({
    page: query.page,
    pageSize: query.pageSize,
  })}`;
  const res = await fetchImpl(url, { cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new CatalogError(messageFrom(body, res.status), res.status);
  return body as Paginated<Product>;
}
```

Add the two server wrappers next to `getProducts`/`getCategoryByIdOrSlug`:

```typescript
/** Fetch a public seller profile against the configured API (null on 404). */
export function getSellerBySlug(slug: string): Promise<Seller | null> {
  return getSeller(slug, { baseUrl: apiBaseUrl() });
}

/** List a seller's products against the configured API. */
export function getSellerProducts(
  slug: string,
  query: { page?: number; pageSize?: number } = {},
): Promise<Paginated<Product>> {
  return listSellerProducts(slug, query, { baseUrl: apiBaseUrl() });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix apps/storefront test -- catalog`
Expected: PASS — all existing catalog tests plus the 5 new (`getSeller` ×3, `listSellerProducts` ×2).

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/lib/catalog.ts apps/storefront/src/lib/catalog.test.ts
git commit -m "feat(m3a): storefront seller catalog client (getSeller + listSellerProducts)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: The `/seller/[slug]` page

**Files:**
- Create: `apps/storefront/src/app/seller/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getSellerBySlug`, `getSellerProducts` (Task 1); `ProductCard` from `@/components/catalog/ProductCard`; `Pagination` from `@/components/catalog/Pagination`; `notFound` from `next/navigation`; `Metadata` from `next`.
- Produces: the route `GET /seller/[slug]` (terminal UI; no later task depends on it).

> **Note:** the page is an async Server Component. The storefront convention does not unit-test Server Components directly (see `apps/storefront/src/app/categories/[slug]/page.tsx` — no test file). Coverage for this slice is Task 1's data-client unit tests plus the Task 3 browser smoke. This task adds no test file; its verification is build + lint + full suite (Step 2).

- [ ] **Step 1: Create the page**

Create `apps/storefront/src/app/seller/[slug]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSellerBySlug, getSellerProducts } from '@/lib/catalog';
import { ProductCard } from '@/components/catalog/ProductCard';
import { Pagination } from '@/components/catalog/Pagination';

type Params = { slug: string };
type Search = { page?: string | string[] };

const PAGE_SIZE = 12;

function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const seller = await getSellerBySlug(slug);
  if (!seller) return { title: 'Seller not found' };
  return {
    title: seller.displayName,
    description: `Products sold by ${seller.displayName}.`,
  };
}

export default async function SellerPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const seller = await getSellerBySlug(slug);
  if (!seller) notFound();

  const page = parsePage((await searchParams).page);
  const { data, total, totalPages } = await getSellerProducts(slug, {
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        {seller.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={seller.logoUrl}
            alt={`${seller.displayName} logo`}
            className="h-16 w-16 rounded-lg object-cover"
          />
        )}
        <h1 className="text-2xl font-semibold text-content">
          {seller.displayName}
        </h1>
        {seller.description && (
          <p className="text-sm text-content-muted">{seller.description}</p>
        )}
        <p className="text-sm text-content-muted">
          {total} {total === 1 ? 'product' : 'products'}
        </p>
      </header>

      {data.length === 0 ? (
        <p className="text-content-muted">No products from this seller yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((product) => (
            <li key={product.id} className="flex">
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_SIZE}
        hrefForPage={(p) => `/seller/${slug}?page=${p}`}
      />
    </main>
  );
}
```

- [ ] **Step 2: Verify build + lint + full suite**

Run, from the repo root:

```bash
npm --prefix apps/storefront test
npm --prefix apps/storefront run lint
npm --prefix apps/storefront run build
```

Expected: full Vitest suite green (no regressions; includes Task 1 tests); lint clean; `next build` succeeds with the new `/seller/[slug]` route compiled.

- [ ] **Step 3: Commit**

```bash
git add apps/storefront/src/app/seller/[slug]/page.tsx
git commit -m "feat(m3a): /seller/[slug] storefront page (profile header + product grid)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Browser smoke vs `ecom_dev` (RULE.md §5)

**Files:** none (verification only).

> Requires the API (`:5000`) and storefront (`:5001`) running against `ecom_dev`. If a stale server already holds a port, free it (`lsof -tiTCP:5001 -sTCP:LISTEN | xargs kill`; same for 5000) and confirm a FRESH start (grep the log for the ready line) before trusting results — a leftover server can serve an old build.

- [ ] **Step 1: Start the API and storefront**

```bash
npm --prefix apps/api run start:dev          # wait for "Nest application successfully started" (:5000)
npm --prefix apps/storefront run dev         # second shell; wait for "Ready" (:5001)
```

- [ ] **Step 2: Identify a seeded ACTIVE seller slug**

```bash
curl -s "http://localhost:5000/sellers/demo-shop" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('displayName'), '/', d.get('slug'))"
```
Expected: `Demo Shop / demo-shop` (or pick another ACTIVE slug, e.g. `platform`).

- [ ] **Step 3: Smoke the seller page (HTML/SSR)**

```bash
curl -s "http://localhost:5001/seller/demo-shop" | grep -o "Demo Shop" | head -1
curl -s "http://localhost:5001/seller/demo-shop" | grep -oE 'href="/products/[^"]+"' | head -3
```
Open `http://localhost:5001/seller/demo-shop` in a browser and verify:
- Header shows the seller name (logo if seeded; description if present); a "N products" count.
- A grid of the seller's products renders; each links to `/products/<id>`.
- If the seller has > 12 products, the numbered `Pagination` appears and `?page=2` works.

- [ ] **Step 4: Smoke the Slice 2 link round-trip**

From a product detail page (`http://localhost:5001/products/<id>` for a Demo Shop product), click the "Sold by Demo Shop" link → it now lands on `/seller/demo-shop` (a real page, no longer a 404).

- [ ] **Step 5: Smoke the not-found path**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:5001/seller/no-such-shop"
```
Expected: `404` (Next renders the not-found page).

- [ ] **Step 6: Stop the servers and record the result**

Stop both dev servers; free the ports. Note the smoke outcome in the slice summary. Do NOT push.

---

## Post-implementation (not a code task)

- Update `docs/IMPLEMENTATION_PLAN.md` M3 line per RULE.md §2: note "M3a Slice 3 (/seller/[slug] page) done".
- STOP and ask the user to verify before starting Slice 4 (rating columns / placeholders, migration F2) — RULE.md §1.

---

## Self-Review

**Spec coverage:**
- Data layer: `Seller` type + `getSeller`/`getSellerBySlug` + `listSellerProducts`/`getSellerProducts` → Task 1. ✓
- Page (header: logo-if-present / name / description-if-present / count; grid; empty state; pagination; profile-first notFound) → Task 2. ✓
- Tests: `getSeller` (200/404/error) + `listSellerProducts` (URL+params, omit-undefined) → Task 1. ✓
- Verification (suite + lint + build + browser smoke incl. Slice-2 link round-trip + 404) → Task 2 Step 2 + Task 3. ✓
- Out of scope (no ratings, no in-page sort/filter, no sellers-index) → not present in any task. ✓

**Placeholder scan:** All code steps contain complete code. The only non-code task (Task 3) lists exact commands and concrete pass/fail observations. No "TBD"/"add validation"/"similar to Task N".

**Type consistency:** `Seller` (Task 1) is returned by `getSellerBySlug` and consumed by the page (Task 2: `seller.displayName`, `seller.description`, `seller.logoUrl`, `slug`). `getSellerProducts(slug, { page, pageSize })` signature in Task 1 matches the call in Task 2. `Paginated<Product>` destructured as `{ data, total, totalPages }` matches the existing envelope. `PAGE_SIZE = 12`, `parsePage`, container/grid classes, and `hrefForPage` all match the verified category-page patterns. The page passes `page`/`totalPages`/`total`/`pageSize`/`hrefForPage` — the exact `PaginationProps` from the existing component.
