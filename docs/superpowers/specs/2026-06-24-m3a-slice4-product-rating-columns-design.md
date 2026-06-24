# M3a Catalog V2 — Slice 4: Product Rating Columns (F2) + Rating Placeholders (design)

**Date:** 2026-06-24
**Phase:** M3a — Catalog V2 (`docs/IMPLEMENTATION_PLAN.md`); migration **F2** (`docs/MIGRATION_PLAN.md`)
**Branch / worktree:** `feat/catalog-v2` (`worktree-feat-catalog-v2`)
**Depends on:** M2 (Product/seller schema). Coordinates with **M4a Reviews**, which *populates* these columns via `review.published` — M3a only *adds* the columns and wires display placeholders.

## Slice scope

The final M3a slice. Adds the F2 rating columns to `Product` and a storefront rating
placeholder that lights up once M4a populates them.

- **In scope:** additive migration `Product.ratingAvg Decimal(3,2) NULL` + `ratingCount Int default 0`; storefront `Product` type fields; a `RatingStars` presentational component (renders nothing until `ratingCount > 0`); wire it on the product detail page; unit tests; migration + smoke verification.
- **Out of scope:** populating ratings / the `review.published` aggregate (M4a); ratings on `ProductCard`/grids (detail page only); admin rating display; the `Review` model + `CHECK` (F1, M4a).

## Verification done during brainstorming (against real code / live tools)

- F2 is additive, no dependency (`MIGRATION_PLAN.md` line 49, Depends `—`). No rating cols in schema yet; no rating migration on this branch.
- **Shared-DB trap confirmed:** `ecom_dev` already has sibling migrations my branch lacks — `20260623113443_product_fts_gin` (M3c) and `20260623075137_app_setting` — so `prisma migrate dev` would flag drift and offer to RESET (memory `shared-ecom-dev-cross-branch-drift`). Avoided.
- **Migration authoring proven (no DB touched):** `prisma migrate diff --from-schema <committed> --to-schema <edited> --script` emits exactly:
  `ALTER TABLE "Product" ADD COLUMN "ratingAvg" DECIMAL(3,2), ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0;` (ran it; verified).
- **migrate engine P1010 fix proven:** `DATABASE_URL` omits the user → Prisma 7 migrate engine fails P1010 (psql/API work via OS-user default). Prefixing the URL with `sotsys033@` makes `migrate status` succeed ("Database schema is up to date!"). Recorded in memory `prisma-migrate-needs-explicit-db-user`. `migrate status`/`deploy` do NOT report the sibling tables as drift (only `migrate dev` does) → `deploy` is safe.
- **API auto-flow confirmed:** products service uses `include: PRODUCT_INCLUDE` (relations only); Prisma returns all scalars by default → new `ratingAvg`/`ratingCount` appear in product responses with no API code change.
- **Storefront insertion point confirmed:** `app/products/[id]/page.tsx` — `<h1>{product.name}</h1>` (L51-52) → `<SellerLink>` (L55) → `<Price>` (L57). `RatingStars` goes after `<SellerLink>`.
- **Star color tokens exist:** `--color-accent-400: #fbbf24` (amber), `--color-accent-600` → `text-accent-400` valid; no hardcoded hex.

## Section 1 — Migration (F2), shared-DB-safe

Add to `Product` in `apps/api/prisma/schema.prisma`:

```prisma
ratingAvg   Decimal?  @db.Decimal(3, 2)   // null until the product has ≥1 review
ratingCount Int       @default(0)
```

Authoring + apply procedure (do NOT use `migrate dev` — it would reset the shared `ecom_dev`):

1. Copy the committed schema (e.g. `git show HEAD:apps/api/prisma/schema.prisma > /tmp/base-schema.prisma`).
2. Edit `schema.prisma` to add the two columns.
3. `npx prisma migrate diff --from-schema /tmp/base-schema.prisma --to-schema ./prisma/schema.prisma --script` → save output as the migration SQL.
4. Create `apps/api/prisma/migrations/<timestamp>_add_product_rating_columns/migration.sql` containing that SQL. Timestamp format matches existing dirs (`YYYYMMDDHHMMSS`).
5. Apply with **user-explicit URL**:
   `DATABASE_URL="postgresql://sotsys033@localhost:5432/ecom_dev?schema=public" SHADOW_DATABASE_URL="postgresql://sotsys033@localhost:5432/ecom_shadow?schema=public" npx prisma migrate deploy`
6. `npx prisma generate` to refresh the client.

Expected migration SQL (verified):
```sql
ALTER TABLE "Product" ADD COLUMN     "ratingAvg" DECIMAL(3,2),
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0;
```

## Section 2 — API auto-exposure (no API code change)

`ProductsService.findOne`/`list` use `include: PRODUCT_INCLUDE` (relations only); Prisma returns
all scalar columns by default. After the migration + `prisma generate`, `ratingAvg` (string, Decimal)
and `ratingCount` (number) appear automatically in `GET /products/:id`, `GET /products`, and
`GET /sellers/:slug/products`. No controller/service/DTO change; no new API tests (no new API code).
Confirmed by smoke (curl a product → `ratingAvg: null`, `ratingCount: 0`).

## Section 3 — Storefront placeholder

**Data layer** (`apps/storefront/src/lib/catalog.ts`) — add to `Product` (required, always returned):
```ts
/** Average rating as a Decimal string, or null until the product has reviews. */
ratingAvg: string | null;
/** Number of reviews; 0 until reviews exist. */
ratingCount: number;
```
Add both to the `sampleProduct` test fixture and assert `getProduct` round-trips them.

**Component** (`apps/storefront/src/components/catalog/RatingStars.tsx`) — server-compatible:
```tsx
interface RatingStarsProps {
  ratingAvg: string | null;
  ratingCount: number;
}
export function RatingStars({ ratingAvg, ratingCount }: RatingStarsProps) {
  if (ratingCount <= 0 || ratingAvg == null) return null;   // nothing until M4a populates
  // render 5 stars, filled to Math.round(Number(ratingAvg)), using text-accent-400 (filled)
  //   and text-content-subtle (empty); show the numeric avg + `(${ratingCount})`.
  // aria-label = `Rated ${ratingAvg} out of 5 from ${ratingCount} reviews`.
  // DESIGN.md tokens only; no hardcoded hex.
}
```

**Page wiring** (`apps/storefront/src/app/products/[id]/page.tsx`): render
`<RatingStars ratingAvg={product.ratingAvg} ratingCount={product.ratingCount} />` directly after
the existing `<SellerLink>` (between it and `<Price>`). Self-guards → nothing shows for current
0-review seed data; lights up automatically when M4a populates.

## Tests (Vitest + RTL, mirroring `SellerLink.test.tsx`)

- `RatingStars.test.tsx`:
  - `ratingCount > 0` + `ratingAvg` set → renders the numeric avg, the `(N)` count, and the
    `aria-label`; asserts the right number of filled stars for a sample avg.
  - renders nothing (`container` empty) when `ratingCount === 0`.
  - renders nothing when `ratingAvg == null` (even if count were >0 — defensive).
- `catalog.test.ts`: `sampleProduct` gains `ratingAvg`/`ratingCount`; assert `getProduct`
  round-trips them.

## Verification (RULE.md §5)

1. `migrate deploy` applies cleanly to `ecom_dev`; `migrate status` → up to date; **re-confirm the
   sibling rows `product_fts_gin` + `app_setting` still present in `_prisma_migrations`** (deploy
   didn't reset).
2. API boots (`start:dev`, user-explicit URL not needed for the app — only the migrate engine);
   `curl http://localhost:5000/products/<id>` → response includes `ratingAvg: null`, `ratingCount: 0`.
3. Storefront: `npm test` green incl. new tests; `npm run lint` + `next build` clean.
4. Browser/SSR smoke: product detail page renders normally with **no rating line** (0-review seed);
   the component is wired and ready to light up under M4a.

## Risks
- **Resetting the shared `ecom_dev`** → mitigated by file-diff authoring + `migrate deploy` (never
  `migrate dev`); explicitly re-verify sibling migrations survive.
- **migrate engine P1010** → use the user-explicit DB URL for migrate commands.
- **Decimal-as-string** → `ratingAvg` is a string in JSON (like `price`); `RatingStars` coerces via
  `Number(ratingAvg)` for star math, guarded by the `ratingAvg == null` check.
- Coordinated, not conflicting, with M4a: M3a owns the columns + display; M4a owns population.
