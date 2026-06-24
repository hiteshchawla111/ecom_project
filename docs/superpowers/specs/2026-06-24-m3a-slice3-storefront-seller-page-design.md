# M3a Catalog V2 — Slice 3: `/seller/[slug]` Storefront Page (design)

**Date:** 2026-06-24
**Phase:** M3a — Catalog V2 (`docs/IMPLEMENTATION_PLAN.md`)
**Branch / worktree:** `feat/catalog-v2` (`worktree-feat-catalog-v2`)
**Depends on:** M3a Slice 1 (public seller-read API: `GET /sellers/:slug` + `GET /sellers/:slug/products`) and Slice 2 (the "Sold by" link that targets `/seller/[slug]`) — both done on this branch.

## Slice scope

The third slice of M3a. **Storefront-only:** a public seller storefront page at
`/seller/[slug]` showing the seller's profile header + a paginated grid of their ACTIVE
products. Lights up the Slice 2 "Sold by" link (which already targets this route).

- **In scope:** storefront `Seller` type + `getSeller`/`getSellerBySlug` +
  `listSellerProducts`/`getSellerProducts` catalog functions; the `/seller/[slug]` page
  (profile header + product grid + pagination + `notFound`); data-client unit tests; browser smoke.
- **Out of scope:** rating placeholders (Slice 4 / migration F2); in-page search/filter/sort
  (the API supports sort params, but YAGNI here — pagination only); a "browse all sellers"
  index route (none in scope).

## Verification done during brainstorming (against real code)

- No existing `Seller` export in `catalog.ts` (only `ProductSeller` at line 29) — safe to add;
  the two are intentionally distinct (`Seller` = full 5-field public profile; `ProductSeller` =
  `{ displayName, slug }` product projection).
- `apps/storefront/src/app/seller/` does not exist — greenfield route.
- `<img>` eslint-disable convention confirmed at `ProductCard.tsx:42`
  (`{/* eslint-disable-next-line @next/next/no-img-element */}`) — mirror it for the logo.
- The category-detail page (`apps/storefront/src/app/categories/[slug]/page.tsx`) is the
  template: `parsePage` (line 13), `PAGE_SIZE = 12` (11), `notFound()` (42), container
  `mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10` (52), grid
  `grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4` (85) — all reused verbatim.

## Section 1 — Data layer (`apps/storefront/src/lib/catalog.ts`)

Add a `Seller` type + two low-level (injectable) functions + two server wrappers, mirroring
the existing `getCategory`/`listProducts` patterns. Reuse `toQuery`, `CatalogError`,
`messageFrom`, `Paginated<T>` (all already in the file).

```ts
export interface Seller {
  id: string;
  displayName: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
}

// mirrors getCategory: 404 → null, non-ok → CatalogError
export async function getSeller(
  slug: string,
  { baseUrl, fetch: fetchImpl = fetch }: CatalogOptions,
): Promise<Seller | null>; // GET `${baseUrl}/sellers/${slug}`

// mirrors listProducts but with slug in the PATH (not a query filter)
export async function listSellerProducts(
  slug: string,
  query: { page?: number; pageSize?: number },
  { baseUrl, fetch: fetchImpl = fetch }: CatalogOptions,
): Promise<Paginated<Product>>; // GET `${baseUrl}/sellers/${slug}/products${toQuery({page,pageSize})}`

// server wrappers binding apiBaseUrl()
export function getSellerBySlug(slug: string): Promise<Seller | null>;
export function getSellerProducts(
  slug: string,
  query: { page?: number; pageSize?: number },
): Promise<Paginated<Product>>;
```

The new `Seller` (full public profile) is distinct from `ProductSeller` (product projection);
both coexist.

## Section 2 — The page (`apps/storefront/src/app/seller/[slug]/page.tsx`)

A Server Component (no `'use client'`) mirroring the category-detail page.

```tsx
type Params = { slug: string };
type Search = { page?: string | string[] };
const PAGE_SIZE = 12;
// reuse the same parsePage(raw) helper shape as the category page

// generateMetadata: await params → getSellerBySlug(slug)
//   null  → { title: 'Seller not found' }
//   found → { title: seller.displayName, description: `Products sold by ${seller.displayName}.` }

export default async function SellerPage({ params, searchParams }) {
  const { slug } = await params;
  const seller = await getSellerBySlug(slug);
  if (!seller) notFound();                         // profile-first 404

  const page = parsePage((await searchParams).page);
  const { data, total, totalPages } = await getSellerProducts(slug, { page, pageSize: PAGE_SIZE });

  // <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10">
  //   <header className="flex flex-col gap-2">
  //     {seller.logoUrl && <img src={seller.logoUrl} alt={`${seller.displayName} logo`} … />}
  //       (eslint-disable-next-line @next/next/no-img-element, like ProductCard)
  //     <h1 className="text-2xl font-semibold text-content">{seller.displayName}</h1>
  //     {seller.description && <p className="text-sm text-content-muted">{seller.description}</p>}
  //     <p className="text-sm text-content-muted">{total} {total === 1 ? 'product' : 'products'}</p>
  //   </header>
  //   {data.length === 0
  //     ? <p className="text-content-muted">No products from this seller yet.</p>
  //     : <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
  //         {data.map(p => <li key={p.id} className="flex"><ProductCard product={p} /></li>)}
  //       </ul>}
  //   <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE}
  //               hrefForPage={(p) => `/seller/${slug}?page=${p}`} />
}
```

- Grid, empty-state, `Pagination`, `parsePage`, container classes = identical to the category
  page (reuse, not reinvent).
- **Logo** rendered only when `logoUrl` is present (guard, like `product.brand &&`) → no broken
  image; `alt = ${displayName} logo`; mirrors the `ProductCard` `<img>` eslint-disable.
- `PAGE_SIZE = 12`; shareable `?page=` URLs via `hrefForPage`.

## Tests (Vitest, in `catalog.test.ts`; the page is an untested Server Component per convention)

- `getSeller`: 200 → returns the `Seller` and asserts URL `${baseUrl}/sellers/<slug>`;
  404 → resolves `null`; non-404 error → throws `CatalogError`.
- `listSellerProducts`: asserts URL `${baseUrl}/sellers/<slug>/products` with `page`/`pageSize`
  query params; returns the `Paginated<Product>` envelope; omits undefined query params.

## Verification (RULE.md §5)

1. `npm test` (storefront) green incl. new tests; no regressions.
2. `npm run lint` + `next build` clean (the new route compiles).
3. **Browser/SSR smoke** vs live API + storefront on `ecom_dev`:
   - `/seller/demo-shop` → 200; header shows logo (if seeded)/name/description/count; grid shows
     the seller's ACTIVE products; pagination appears when > 12.
   - A product detail "Sold by" link now lands on this real page (Slice 2 link lights up).
   - `/seller/no-such-shop` → the standard 404 page (`notFound`).
   - Only that seller's products appear (cross-check `GET /sellers/demo-shop/products`).

## Risks
- **Logo URL untrusted/broken** → only rendered when present; `next build` has no remote-image
  config dependency because a plain `<img>` is used (same as `ProductCard`).
- **Products endpoint 404** → avoided by fetching the profile first; products are fetched only
  after a non-null ACTIVE seller resolves.
- No migration, no API change in this slice.
