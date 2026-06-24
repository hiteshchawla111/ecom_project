# M3a Catalog V2 — Slice 2: Storefront "Sold by" Link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a "Sold by &lt;seller&gt;" link on the storefront product detail page, linking to the seller storefront page (`/seller/[slug]`, built in Slice 3).

**Architecture:** Extend the storefront `Product` type with an optional `seller` (the public API already returns `seller: { displayName, slug }` on `GET /products/:id`). Add a small server-compatible `SellerLink` presentational component that renders the link (or `null` when seller is absent), and render it under the product name on the detail page.

**Tech Stack:** Next.js (App Router) + TypeScript, Vitest + React Testing Library, Tailwind CSS with `DESIGN.md` tokens (`packages/design-tokens/theme.css`).

**Spec:** `docs/superpowers/specs/2026-06-24-m3a-slice2-storefront-sold-by-link-design.md`

## Global Constraints

- Strict TypeScript; no `any`.
- Functional React components; `SellerLink` is server-compatible (NO `'use client'` — mirrors `ProductCard`/`CategoryTiles`).
- Tailwind classes only from existing `DESIGN.md` tokens — never hardcode hex. Tokens used here exist: `text-content`, `text-content-muted`, `text-primary-700`, `focus-visible:ring-primary-700` (verified in `packages/design-tokens/theme.css`).
- The seller sub-type is `ProductSeller = { displayName: string; slug: string }`; on `Product` it is **optional** (`seller?`).
- `SellerLink` renders `null` when `seller`, `seller.slug`, or `seller.displayName` is missing.
- Link text is the seller **name only**; the words "Sold by " are plain text; link carries `aria-label={`View products sold by ${displayName}`}` (WCAG).
- Link target is `/seller/${slug}` (will 404 until Slice 3 — accepted on this unmerged branch).
- Run storefront commands from `apps/storefront`. Test runner: `npm test` (Vitest run); single file: `npm test -- <pattern>`. Lint: `npm run lint`. Build: `npm run build`. Fixed dev port `:5001`.
- Commit messages end with a blank line then:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Do NOT `git push` (RULE.md §3).

---

## File Structure

- **Modify** `apps/storefront/src/lib/catalog.ts` — add `ProductSeller` interface + `seller?` on `Product`.
- **Modify** `apps/storefront/src/lib/catalog.test.ts` — add `seller` to `sampleProduct`; assert `getProduct` round-trips it.
- **Create** `apps/storefront/src/components/catalog/SellerLink.tsx` — the presentational component.
- **Create** `apps/storefront/src/components/catalog/SellerLink.test.tsx` — its unit tests.
- **Modify** `apps/storefront/src/app/products/[id]/page.tsx` — import + render `<SellerLink>` under the product name.

---

## Task 1: Add the `seller` field to the storefront `Product` type

**Files:**
- Modify: `apps/storefront/src/lib/catalog.ts` (interfaces block, around lines 22–43)
- Test: `apps/storefront/src/lib/catalog.test.ts` (`sampleProduct` fixture ~line 22; `getProduct` describe ~line 219)

**Interfaces:**
- Consumes: existing `Product` interface, `getProduct`, `CatalogOptions`.
- Produces:
  - `export interface ProductSeller { displayName: string; slug: string }`
  - `Product.seller?: ProductSeller`

- [ ] **Step 1: Write the failing test**

In `apps/storefront/src/lib/catalog.test.ts`, first add a `seller` to the shared `sampleProduct` fixture (replace the existing object literal at ~lines 22–33):

```typescript
const sampleProduct: Product = {
  id: 'p1',
  name: 'Aurora Phone',
  sku: 'PH-001',
  description: 'A phone',
  price: '799',
  salePrice: '699',
  brand: 'Aurora',
  status: 'ACTIVE',
  categoryId: 'c1',
  images: [],
  seller: { displayName: 'Aurora Store', slug: 'aurora-store' },
};
```

Then add a new test inside the existing `describe('getProduct', () => { ... })` block (after the "returns the product" test):

```typescript
  it('round-trips the seller field on the product detail response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, sampleProduct));

    const res = await getProduct('p1', { ...opts, fetch: fetchMock });

    expect(res?.seller).toEqual({
      displayName: 'Aurora Store',
      slug: 'aurora-store',
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/storefront test -- catalog`
Expected: FAIL — TypeScript error: `seller` does not exist on type `Product` (the fixture literal won't compile / the assertion can't resolve the field).

- [ ] **Step 3: Write minimal implementation**

In `apps/storefront/src/lib/catalog.ts`, add the `ProductSeller` interface immediately after the `ProductCategory` interface (after line 27):

```typescript
export interface ProductSeller {
  displayName: string;
  slug: string;
}
```

Then add the optional `seller` field to the `Product` interface (after the `images?` line, ~line 42):

```typescript
  /** The owning seller (shop name + slug). Present on product detail; may be
   *  absent on list responses. Public-safe fields only — never KYC/status. */
  seller?: ProductSeller;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/storefront test -- catalog`
Expected: PASS — all existing catalog tests plus the new round-trip test.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/lib/catalog.ts apps/storefront/src/lib/catalog.test.ts
git commit -m "feat(m3a): storefront Product.seller (optional public seller projection)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `SellerLink` component + tests

**Files:**
- Create: `apps/storefront/src/components/catalog/SellerLink.tsx`
- Test: `apps/storefront/src/components/catalog/SellerLink.test.tsx`

**Interfaces:**
- Consumes: `ProductSeller` from `@/lib/catalog` (Task 1); `Link` from `next/link`.
- Produces: `export function SellerLink({ seller }: { seller?: ProductSeller | null }): JSX.Element | null`

- [ ] **Step 1: Write the failing test**

Create `apps/storefront/src/components/catalog/SellerLink.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SellerLink } from './SellerLink';

describe('SellerLink', () => {
  it('renders a "Sold by" link to the seller storefront', () => {
    render(<SellerLink seller={{ displayName: 'Demo Shop', slug: 'demo-shop' }} />);

    expect(screen.getByText(/sold by/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /view products sold by demo shop/i });
    expect(link).toHaveAttribute('href', '/seller/demo-shop');
    expect(link).toHaveTextContent('Demo Shop');
  });

  it('renders nothing when seller is undefined', () => {
    const { container } = render(<SellerLink seller={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the slug is missing', () => {
    const { container } = render(
      // @ts-expect-error — intentionally malformed input to prove the guard
      <SellerLink seller={{ displayName: 'No Slug' }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the displayName is missing', () => {
    const { container } = render(
      // @ts-expect-error — intentionally malformed input to prove the guard
      <SellerLink seller={{ slug: 'no-name' }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/storefront test -- SellerLink`
Expected: FAIL — `Cannot find module './SellerLink'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/storefront/src/components/catalog/SellerLink.tsx`:

```tsx
import Link from 'next/link';
import type { ProductSeller } from '@/lib/catalog';

interface SellerLinkProps {
  seller?: ProductSeller | null;
}

/**
 * "Sold by <seller>" attribution line for the product detail page.
 *
 * Only the seller name is the link (the meaningful target); "Sold by " is plain
 * text. Renders nothing when the seller (or its slug/displayName) is absent, so
 * a product without a seller projection shows no empty line. Links to the seller
 * storefront page at /seller/[slug].
 */
export function SellerLink({ seller }: SellerLinkProps) {
  if (!seller?.slug || !seller.displayName) return null;

  return (
    <p className="text-sm text-content-muted">
      Sold by{' '}
      <Link
        href={`/seller/${seller.slug}`}
        aria-label={`View products sold by ${seller.displayName}`}
        className="rounded-sm font-medium text-content-muted underline-offset-2 hover:text-primary-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
      >
        {seller.displayName}
      </Link>
    </p>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/storefront test -- SellerLink`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/components/catalog/SellerLink.tsx apps/storefront/src/components/catalog/SellerLink.test.tsx
git commit -m "feat(m3a): SellerLink component (sold-by attribution, a11y, graceful omit)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Render `SellerLink` on the product detail page

**Files:**
- Modify: `apps/storefront/src/app/products/[id]/page.tsx` (import block lines 1–7; JSX after the `<h1>` at lines 50–52)

**Interfaces:**
- Consumes: `SellerLink` from `@/components/catalog/SellerLink` (Task 2); `product.seller` (Task 1).
- Produces: nothing (terminal UI wiring).

> **Note:** the product detail page is an async Server Component. The storefront convention does not unit-test Server Components directly (see `apps/storefront/src/app/page.test.tsx`); the behavior is covered by Task 2's `SellerLink` unit tests plus the Task 4 browser smoke. This task adds no new test file. Verification here is the build/lint/full-suite step (Step 3) — the page must still compile and the suite stay green.

- [ ] **Step 1: Add the import**

In `apps/storefront/src/app/products/[id]/page.tsx`, add this import alongside the other `@/components/catalog/*` imports (after line 6, the `RelatedProducts` import):

```typescript
import { SellerLink } from '@/components/catalog/SellerLink';
```

- [ ] **Step 2: Render the component under the product name**

In the same file, locate the `<h1>` product-name block (lines 50–52):

```tsx
          <h1 className="text-3xl font-bold text-content">
            {product.name}
          </h1>
```

Insert `<SellerLink>` immediately after the closing `</h1>`, before the `<Price>` element:

```tsx
          <h1 className="text-3xl font-bold text-content">
            {product.name}
          </h1>

          <SellerLink seller={product.seller} />

          <Price
            price={product.price}
            salePrice={product.salePrice}
            className="text-xl"
          />
```

- [ ] **Step 3: Verify build + lint + full suite**

Run, from the repo root:

```bash
npm --prefix apps/storefront test
npm --prefix apps/storefront run lint
npm --prefix apps/storefront run build
```

Expected: full Vitest suite green (no regressions; includes Task 1 + Task 2 tests); lint clean; `next build` succeeds (the page compiles with the new component).

- [ ] **Step 4: Commit**

```bash
git add apps/storefront/src/app/products/[id]/page.tsx
git commit -m "feat(m3a): render SellerLink on the product detail page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Browser smoke vs `ecom_dev` (RULE.md §5)

**Files:** none (verification only).

> Requires the API (`apps/api`, port `:5000`) and storefront (`apps/storefront`, port `:5001`) both running against `ecom_dev`. If a stale server already holds a port, free it first (`lsof -tiTCP:5001 -sTCP:LISTEN | xargs kill`) and confirm a fresh start before trusting the page — a leftover server can serve an old build.

- [ ] **Step 1: Start the API**

```bash
npm --prefix apps/api run start:dev
```
Wait for "Nest application successfully started" (port 5000).

- [ ] **Step 2: Start the storefront**

In a second shell:
```bash
npm --prefix apps/storefront run dev
```
Wait for the Next dev server ready line (port 5001).

- [ ] **Step 3: Identify a seeded ACTIVE product id**

Find a product id that belongs to an ACTIVE seller (e.g. via the API):
```bash
curl -s "http://localhost:5000/sellers/demo-shop/products?pageSize=1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['id'] if d.get('data') else 'NONE')"
```
Note the printed product id.

- [ ] **Step 4: Smoke the product detail page**

Open `http://localhost:5001/products/<id>` in a browser. Verify:
- A "Sold by &lt;shop name&gt;" line appears directly under the product name.
- The shop name is a link; hovering shows it underline/color-change; its `href` is `/seller/<slug>`.
- Clicking it navigates to `/seller/<slug>` which **404s** (expected — Slice 3 builds that page).
- Keyboard: Tab to the link shows a visible focus ring.

- [ ] **Step 5: (Optional) Confirm graceful omit**

If a product whose API response lacks a `seller` is available, open its detail page and confirm **no** "Sold by" line renders (no empty gap). If no such product exists in seed data, note that the omit path is covered by Task 2 unit tests and skip.

- [ ] **Step 6: Stop the servers and record the result**

Stop both dev servers. Note the smoke outcome in the slice summary. Do NOT push.

---

## Post-implementation (not a code task)

- Update `docs/IMPLEMENTATION_PLAN.md` M3 line per RULE.md §2: note "M3a Slice 2 (storefront sold-by link) done".
- STOP and ask the user to verify before starting Slice 3 (`/seller/[slug]` page) — RULE.md §1.

---

## Self-Review

**Spec coverage:**
- Data layer: `ProductSeller` + optional `Product.seller` → Task 1. ✓
- `SellerLink` component (server-compatible, name-only link, aria-label, null guard, tokens) → Task 2. ✓
- Page wiring under product name → Task 3. ✓
- Tests: `SellerLink.test.tsx` (link + a11y + 3 null-guard cases) + `catalog.test.ts` seller round-trip → Tasks 2 & 1. ✓
- Verification (suite + lint + build + browser smoke incl. expected 404 + graceful omit) → Task 3 Step 3 + Task 4. ✓
- Out of scope (no `/seller/[slug]` page, no card "sold by", no ratings) → not present in any task. ✓

**Placeholder scan:** All code steps contain complete code. No "TBD"/"add validation"/"similar to Task N". The only non-code task (Task 4) lists exact commands and concrete pass/fail observations.

**Type consistency:** `ProductSeller` defined in Task 1 is imported by `SellerLink` (Task 2) and the page passes `product.seller` (Task 1's field) to it (Task 3). The component prop type `{ seller?: ProductSeller | null }` matches the field type `seller?: ProductSeller` (the extra `| null` is a defensive widening, compatible). Link href `/seller/${slug}`, aria-label text, and the "Sold by" copy are identical across the spec, Task 2 impl, and Task 2 tests.
