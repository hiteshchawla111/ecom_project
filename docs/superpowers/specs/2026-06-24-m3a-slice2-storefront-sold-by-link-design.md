# M3a Catalog V2 — Slice 2: Storefront "Sold by" Link (design)

**Date:** 2026-06-24
**Phase:** M3a — Catalog V2 (`docs/IMPLEMENTATION_PLAN.md`)
**Branch / worktree:** `feat/catalog-v2` (`worktree-feat-catalog-v2`)
**Depends on:** M3a Slice 1 (public seller-read API) — done on this branch. The API already returns `seller: { displayName, slug }` on `GET /products/:id` (shipped in M2 slice 6e).

## Slice scope

The second slice of M3a. **Storefront-only:** attribute a product to its seller with a
"Sold by &lt;seller&gt;" link on the product detail page, linking to the seller storefront
page that Slice 3 builds.

- **In scope:** storefront `Product` type gains an optional `seller`; a small `SellerLink`
  presentational component; render it on the product detail page; unit tests; browser smoke.
- **Out of scope:** the `/seller/[slug]` page itself (Slice 3 — the link will 404 until then,
  acceptable on this unmerged branch); "sold by" on product cards/list (not requested);
  `Product.ratingAvg/ratingCount` + rating placeholders (Slice 4 / migration F2).

## Verification done during brainstorming

Checked against real code before finalizing:
- Insertion point `apps/storefront/src/app/products/[id]/page.tsx:50–52` (after `<h1>`,
  before `<Price>`) confirmed.
- Design tokens exist in `packages/design-tokens/theme.css`: `--color-content` (line 68),
  `--color-content-muted` (69), `--color-primary-700` (18, light + dark) → the Tailwind
  classes `text-content`, `text-content-muted`, `text-primary-700`,
  `focus-visible:ring-primary-700` are all valid. No hardcoded hex.
- `CategoryTiles`/`ProductCard` are plain server components importing `Link from 'next/link'`;
  `SellerLink` follows the same convention (no `'use client'` needed).

## Section 1 — Data layer (`apps/storefront/src/lib/catalog.ts`)

Add a seller sub-type mirroring `ProductCategory`/`ProductImage`, and extend `Product`:

```ts
export interface ProductSeller {
  displayName: string;
  slug: string;
}
// added to the Product interface:
seller?: ProductSeller;
```

No fetch/client changes — `getProduct`/`getProductById` already return the raw API response,
which carries `seller` on product detail. `seller` is **optional** because list responses (and
any future endpoint) may omit it (cf. memory: list endpoints omit relations). Extend the
`catalog.test.ts` `sampleProduct` fixture with a `seller` and assert `getProduct` round-trips it.

## Section 2 — `SellerLink` component (`apps/storefront/src/components/catalog/SellerLink.tsx`)

A small server-compatible presentational component (no client interactivity), mirroring the
existing catalog link components.

```tsx
import Link from 'next/link';
import type { ProductSeller } from '@/lib/catalog';

interface SellerLinkProps {
  seller?: ProductSeller | null;
}

export function SellerLink({ seller }: SellerLinkProps) {
  if (!seller?.slug || !seller.displayName) return null; // graceful omit
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

- **"Sold by " is plain muted text**; only the seller **name** is the link (the meaningful
  target), with `aria-label` for screen-reader clarity (WCAG).
- Returns **`null`** when `seller`, `slug`, or `displayName` is absent → no empty line
  (matches the page's existing `product.brand && (...)` guard style).
- Tailwind uses `DESIGN.md` tokens only; visible focus ring for keyboard nav.
- Targets `/seller/[slug]` (final markup; the route lands in Slice 3).

## Section 3 — Page wiring

`apps/storefront/src/app/products/[id]/page.tsx`: import `SellerLink`; render it directly
under the product name. The component self-guards, so no extra page-level conditional:

```tsx
<h1 className="text-3xl font-bold text-content">{product.name}</h1>
<SellerLink seller={product.seller} />

<Price ... />
```

## Tests (Vitest + RTL, mirroring `ProductCard.test.tsx`)

The product page is a Server Component (untested per the storefront convention); the extracted
`SellerLink` is fully unit-tested.

- `SellerLink.test.tsx`:
  - renders "Sold by" and a link whose text is the seller `displayName` and whose `href` is
    `/seller/<slug>`;
  - the link has `aria-label` = `View products sold by <displayName>`;
  - renders nothing when `seller` is `undefined`; when `slug` is missing; when `displayName`
    is missing (assert empty container / `queryBy…` null).
- `catalog.test.ts`: extend `sampleProduct` with a `seller`; assert `getProduct` returns the
  `seller` field intact.

## Verification (RULE.md §5)

1. `npm test` (storefront) green incl. new tests; no regressions.
2. `npm run lint` clean; build/`tsc` clean.
3. **Browser smoke** vs live API + storefront on `ecom_dev`: a product detail page shows
   "Sold by &lt;shop&gt;" under the name, linking to `/seller/<slug>` (404 until Slice 3 —
   expected); a product response without a seller shows no "Sold by" line.

## Risks
- **Dead link until Slice 3** — accepted: both slices ship on this branch before merge; the
  markup is final, no rework.
- **Missing seller on some responses** — handled by the optional type + component `null` guard.
- No migration, no API change in this slice.
