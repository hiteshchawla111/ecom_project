# M3a Catalog V2 — Slice 4: Product Rating Columns (F2) + Rating Placeholders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the F2 rating columns (`Product.ratingAvg`, `ratingCount`) via a shared-DB-safe additive migration, and wire a storefront `RatingStars` placeholder that lights up once M4a Reviews populates them.

**Architecture:** A purely additive Prisma migration adds two columns; the API auto-returns them (no code change — Prisma returns all scalars by default). The storefront `Product` type gains the two fields and a small server-compatible `RatingStars` component renders stars+count only when `ratingCount > 0`, wired onto the product detail page beside the existing `SellerLink`.

**Tech Stack:** NestJS + Prisma 7 (PostgreSQL), Next.js (App Router) + TypeScript, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-06-24-m3a-slice4-product-rating-columns-design.md`

## Global Constraints

- Strict TypeScript; no `any`. Functional React; `RatingStars` is server-compatible (NO `'use client'`).
- Column defs (F2, verbatim): Prisma `ratingAvg Decimal? @db.Decimal(3, 2)` (null until ≥1 review) and `ratingCount Int @default(0)`.
- **Shared dev DB:** `ecom_dev` is shared across parallel M3 worktrees and already has sibling migrations this branch lacks (`product_fts_gin`, `app_setting`). **DO NOT run `prisma migrate dev`** — it would flag drift and offer to RESET, destroying sibling work. Author via file-diff; apply via `migrate deploy`.
- **Prisma migrate engine needs an explicit DB user:** `apps/api/.env` `DATABASE_URL` omits the user, so the migrate engine fails `P1010`. Run migrate commands with the user spelled out: `DATABASE_URL="postgresql://sotsys033@localhost:5432/ecom_dev?schema=public" SHADOW_DATABASE_URL="postgresql://sotsys033@localhost:5432/ecom_shadow?schema=public" npx prisma <cmd>`. Do NOT edit the gitignored `.env` default.
- Storefront `Product` rating fields are **required** (always returned once the migration lands): `ratingAvg: string | null` (Decimal-as-string), `ratingCount: number`.
- `RatingStars` renders `null` when `ratingCount <= 0` OR `ratingAvg == null`. Filled stars use `text-accent-400`, empty use `text-content-subtle`; show numeric avg + `(${ratingCount})`; `aria-label="Rated ${ratingAvg} out of 5 from ${ratingCount} reviews"`. DESIGN.md tokens only — no hardcoded hex.
- API commands from `apps/api`; storefront from `apps/storefront` (use `npm --prefix`). API test: `npm --prefix apps/api test`. Storefront test: `npm --prefix apps/storefront test -- <pattern>`.
- Commit messages end with a blank line then:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Do NOT `git push` (RULE.md §3).

---

## File Structure

- **Modify** `apps/api/prisma/schema.prisma` — add 2 columns to `Product`.
- **Create** `apps/api/prisma/migrations/<timestamp>_add_product_rating_columns/migration.sql` — additive `ALTER TABLE`.
- **Modify** `apps/storefront/src/lib/catalog.ts` — add `ratingAvg`/`ratingCount` to `Product`.
- **Modify** `apps/storefront/src/lib/catalog.test.ts` — fixture + round-trip assertion.
- **Create** `apps/storefront/src/components/catalog/RatingStars.tsx` — the placeholder component.
- **Create** `apps/storefront/src/components/catalog/RatingStars.test.tsx` — its tests.
- **Modify** `apps/storefront/src/app/products/[id]/page.tsx` — render `<RatingStars>`.

---

## Task 1: F2 migration — add `ratingAvg` / `ratingCount` to `Product`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (the `Product` model)
- Create: `apps/api/prisma/migrations/<timestamp>_add_product_rating_columns/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: two new columns on `Product` (`ratingAvg DECIMAL(3,2) NULL`, `ratingCount INT NOT NULL DEFAULT 0`) in `ecom_dev` and the regenerated Prisma client; later tasks rely on the API returning them.

- [ ] **Step 1: Snapshot the committed schema (diff baseline)**

From `apps/api`:
```bash
git show HEAD:apps/api/prisma/schema.prisma > /tmp/base-schema.prisma
```

- [ ] **Step 2: Edit the schema**

In `apps/api/prisma/schema.prisma`, in the `Product` model, add these two lines (place them just after the `status` field, before the relation fields):

```prisma
  ratingAvg   Decimal?       @db.Decimal(3, 2)
  ratingCount Int            @default(0)
```

- [ ] **Step 3: Generate the migration SQL via file-diff (no DB touched)**

From `apps/api`:
```bash
npx prisma migrate diff --from-schema /tmp/base-schema.prisma --to-schema ./prisma/schema.prisma --script
```
Expected output (exactly):
```sql
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "ratingAvg" DECIMAL(3,2),
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0;
```
If the output differs (e.g. extra tables), STOP — the schema edit touched more than intended; revert and redo Step 2.

- [ ] **Step 4: Create the migration file**

Pick a timestamp newer than the last local migration (`20260622105839...`) in `YYYYMMDDHHMMSS` form (e.g. `20260624120000`). Create:
`apps/api/prisma/migrations/20260624120000_add_product_rating_columns/migration.sql` with:

```sql
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "ratingAvg" DECIMAL(3,2),
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0;
```

(No `migration_lock.toml` change — it already exists with `provider = "postgresql"`.)

- [ ] **Step 5: Apply to `ecom_dev` with `migrate deploy` (user-explicit URL)**

From `apps/api`:
```bash
DATABASE_URL="postgresql://sotsys033@localhost:5432/ecom_dev?schema=public" \
SHADOW_DATABASE_URL="postgresql://sotsys033@localhost:5432/ecom_shadow?schema=public" \
npx prisma migrate deploy
```
Expected: it reports applying `20260624120000_add_product_rating_columns` (1 migration) and succeeds. It must NOT mention resetting or dropping anything.

- [ ] **Step 6: Verify the migration applied and sibling migrations survived**

```bash
DATABASE_URL="postgresql://sotsys033@localhost:5432/ecom_dev?schema=public" \
SHADOW_DATABASE_URL="postgresql://sotsys033@localhost:5432/ecom_shadow?schema=public" \
npx prisma migrate status
psql -d ecom_dev -t -A -c "SELECT migration_name FROM _prisma_migrations WHERE migration_name IN ('20260623113443_product_fts_gin','20260623075137_app_setting','20260624120000_add_product_rating_columns') ORDER BY migration_name;"
psql -d ecom_dev -t -A -c "SELECT column_name FROM information_schema.columns WHERE table_name='Product' AND column_name IN ('ratingAvg','ratingCount') ORDER BY column_name;"
```
Expected: `migrate status` → "Database schema is up to date!"; the `psql` queries list all three migrations (sibling ones survived) and both new columns (`ratingAvg`, `ratingCount`).

- [ ] **Step 7: Regenerate the Prisma client**

From `apps/api`:
```bash
npx prisma generate
```
Expected: client regenerated; `Product` type now has `ratingAvg`/`ratingCount`.

- [ ] **Step 8: Confirm the API still builds (tsc, since nest build swallows tsc errors)**

From `apps/api`:
```bash
npx tsc --noEmit -p tsconfig.json
npm test
```
Expected: tsc clean (the new scalar fields don't break existing code); full API suite still green (no API code changed).

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260624120000_add_product_rating_columns/
git commit -m "feat(m3a): add Product.ratingAvg/ratingCount columns (F2, additive)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: API smoke — confirm rating fields auto-appear (no code)

**Files:** none (verification only).

> No API code changes: `ProductsService` uses `include: PRODUCT_INCLUDE` (relations only), so Prisma returns the new scalars by default. This task proves it over HTTP. If a stale `:5000` server is running, free it first (`lsof -tiTCP:5000 -sTCP:LISTEN | xargs kill`) and confirm a fresh start (grep the log for "successfully started") before trusting curl.

- [ ] **Step 1: Start the API**

From `apps/api`: `npm run start:dev` — wait for "Nest application successfully started" (:5000). (The running app uses the driver adapter and does NOT need the user-explicit URL; only the migrate engine did.)

- [ ] **Step 2: Curl a product and confirm the fields**

```bash
PID=$(curl -s "http://localhost:5000/sellers/demo-shop/products?pageSize=1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['id'])")
curl -s "http://localhost:5000/products/$PID" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ratingAvg:', d.get('ratingAvg'), '| ratingCount:', d.get('ratingCount'), '| has keys:', 'ratingAvg' in d and 'ratingCount' in d)"
```
Expected: `ratingAvg: None | ratingCount: 0 | has keys: True` (null avg, zero count, both present).

- [ ] **Step 3: Stop the server**

Stop `start:dev`. Free `:5000`. Record the outcome. (No commit — verification only.)

---

## Task 3: Storefront `Product` type — `ratingAvg` / `ratingCount`

**Files:**
- Modify: `apps/storefront/src/lib/catalog.ts` (the `Product` interface)
- Test: `apps/storefront/src/lib/catalog.test.ts` (`sampleProduct` fixture + `getProduct` describe)

**Interfaces:**
- Consumes: existing `Product` interface, `getProduct`.
- Produces: `Product.ratingAvg: string | null` and `Product.ratingCount: number` (consumed by Task 4's component and Task 5's page).

- [ ] **Step 1: Write the failing test**

In `apps/storefront/src/lib/catalog.test.ts`, add `ratingAvg`/`ratingCount` to the shared `sampleProduct` fixture (so it conforms to the new required fields):

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
  ratingAvg: '4.50',
  ratingCount: 12,
};
```

Add a test inside the existing `describe('getProduct', () => { ... })` block:

```typescript
  it('round-trips the rating fields on the product detail response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, sampleProduct));

    const res = await getProduct('p1', { ...opts, fetch: fetchMock });

    expect(res?.ratingAvg).toBe('4.50');
    expect(res?.ratingCount).toBe(12);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/storefront test -- catalog`
Expected: FAIL — TypeScript errors: `ratingAvg`/`ratingCount` missing on `Product` (fixture won't compile / assertion can't resolve).

- [ ] **Step 3: Write minimal implementation**

In `apps/storefront/src/lib/catalog.ts`, add to the `Product` interface (after the `seller?` field):

```typescript
  /** Average rating as a Decimal string, or null until the product has reviews. */
  ratingAvg: string | null;
  /** Number of published reviews; 0 until reviews exist. */
  ratingCount: number;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/storefront test -- catalog`
Expected: PASS — all catalog tests incl. the new round-trip.

> If other test files instantiate a `Product` literal without these fields, they will now fail to compile. Search `apps/storefront/src` for `: Product = {` / `Product[] = [` and add `ratingAvg: null, ratingCount: 0` to any such fixtures. (The `ProductCard.test.tsx` `base` fixture is the likely one.) Re-run the full suite in Step... see Task 5 Step 3 for the full-suite gate; for THIS task run `npm --prefix apps/storefront test` once to catch compile breaks before committing.

- [ ] **Step 5: Run the full storefront suite (catch fixture compile breaks)**

Run: `npm --prefix apps/storefront test`
Expected: green. If any `Product` literal elsewhere now fails to typecheck, add `ratingAvg: null, ratingCount: 0` to it, then re-run until green.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/src/lib/catalog.ts apps/storefront/src/lib/catalog.test.ts
# include any other fixture files you had to touch:
git add -A apps/storefront/src
git commit -m "feat(m3a): storefront Product rating fields (ratingAvg, ratingCount)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `RatingStars` component + tests

**Files:**
- Create: `apps/storefront/src/components/catalog/RatingStars.tsx`
- Test: `apps/storefront/src/components/catalog/RatingStars.test.tsx`

**Interfaces:**
- Consumes: nothing (takes primitives).
- Produces: `export function RatingStars({ ratingAvg, ratingCount }: { ratingAvg: string | null; ratingCount: number }): JSX.Element | null`

- [ ] **Step 1: Write the failing test**

Create `apps/storefront/src/components/catalog/RatingStars.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RatingStars } from './RatingStars';

describe('RatingStars', () => {
  it('renders the average, count, and an accessible label when there are reviews', () => {
    render(<RatingStars ratingAvg="4.50" ratingCount={12} />);

    // numeric average and count are shown
    expect(screen.getByText('4.50')).toBeInTheDocument();
    expect(screen.getByText('(12)')).toBeInTheDocument();
    // accessible label on the group
    expect(
      screen.getByLabelText('Rated 4.50 out of 5 from 12 reviews'),
    ).toBeInTheDocument();
  });

  it('renders nothing when ratingCount is 0', () => {
    const { container } = render(<RatingStars ratingAvg={null} ratingCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when ratingAvg is null even if a count is present', () => {
    const { container } = render(<RatingStars ratingAvg={null} ratingCount={5} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/storefront test -- RatingStars`
Expected: FAIL — `Cannot find module './RatingStars'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/storefront/src/components/catalog/RatingStars.tsx`:

```tsx
interface RatingStarsProps {
  /** Average rating as a Decimal string (e.g. "4.50"), or null when no reviews. */
  ratingAvg: string | null;
  /** Number of published reviews. */
  ratingCount: number;
}

const STAR_COUNT = 5;

/**
 * Product rating display. Renders 5 stars filled to the rounded average, the
 * numeric average, and the review count. Renders nothing until the product has
 * at least one review (ratingCount > 0 and a non-null average) — so it stays
 * invisible until M4a Reviews populates the aggregate columns.
 */
export function RatingStars({ ratingAvg, ratingCount }: RatingStarsProps) {
  if (ratingCount <= 0 || ratingAvg == null) return null;

  const avg = Number(ratingAvg);
  const filled = Math.round(avg);

  return (
    <div
      className="flex items-center gap-1.5 text-sm"
      aria-label={`Rated ${ratingAvg} out of 5 from ${ratingCount} reviews`}
    >
      <span aria-hidden="true" className="flex">
        {Array.from({ length: STAR_COUNT }, (_, i) => (
          <span
            key={i}
            className={i < filled ? 'text-accent-400' : 'text-content-subtle'}
          >
            ★
          </span>
        ))}
      </span>
      <span className="font-medium text-content">{ratingAvg}</span>
      <span className="text-content-muted">({ratingCount})</span>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/storefront test -- RatingStars`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/src/components/catalog/RatingStars.tsx apps/storefront/src/components/catalog/RatingStars.test.tsx
git commit -m "feat(m3a): RatingStars component (renders only when reviews exist)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Render `RatingStars` on the product detail page

**Files:**
- Modify: `apps/storefront/src/app/products/[id]/page.tsx` (import block; JSX after `<SellerLink>` at line ~55)

**Interfaces:**
- Consumes: `RatingStars` from `@/components/catalog/RatingStars` (Task 4); `product.ratingAvg`/`product.ratingCount` (Task 3).
- Produces: nothing (terminal UI wiring).

> The page is an async Server Component — not unit-tested directly per the storefront convention (Task 4's component tests + Task 6 smoke cover behavior). Verification here is build + lint + full suite.

- [ ] **Step 1: Add the import**

In `apps/storefront/src/app/products/[id]/page.tsx`, add alongside the other `@/components/catalog/*` imports (after the `SellerLink` import line):

```typescript
import { RatingStars } from '@/components/catalog/RatingStars';
```

- [ ] **Step 2: Render it after `<SellerLink>`**

Locate the existing block:

```tsx
          <SellerLink seller={product.seller} />
```

Insert `<RatingStars>` immediately after it (before `<Price>`):

```tsx
          <SellerLink seller={product.seller} />

          <RatingStars
            ratingAvg={product.ratingAvg}
            ratingCount={product.ratingCount}
          />
```

- [ ] **Step 3: Verify build + lint + full suite**

From the repo root:
```bash
npm --prefix apps/storefront test
npm --prefix apps/storefront run lint
npm --prefix apps/storefront run build
```
Expected: full suite green; lint clean; `next build` succeeds (page compiles with the new component).

- [ ] **Step 4: Commit**

```bash
git add apps/storefront/src/app/products/[id]/page.tsx
git commit -m "feat(m3a): render RatingStars on the product detail page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Browser/SSR smoke vs `ecom_dev` (RULE.md §5)

**Files:** none (verification only).

> Needs API (:5000) + storefront (:5001) against `ecom_dev`. Free stale ports first and confirm fresh starts (grep logs for ready lines) before trusting results.

- [ ] **Step 1: Start both servers**

```bash
npm --prefix apps/api run start:dev          # wait for "Nest application successfully started"
npm --prefix apps/storefront run dev         # second shell; wait for "Ready"
```

- [ ] **Step 2: Smoke the product detail page (no rating shown for 0-review seed)**

```bash
PID=$(curl -s "http://localhost:5000/sellers/demo-shop/products?pageSize=1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['id'])")
curl -s "http://localhost:5001/products/$PID" | python3 -c "import sys; h=sys.stdin.read(); print('page renders (has product name region):', '<h1' in h); print('no rating label present (expected, 0 reviews):', 'out of 5 from' not in h)"
```
Expected: page renders; `out of 5 from` NOT present (the component correctly returns null for the 0-review seed). Open the page in a browser to confirm no empty rating gap under the seller line.

- [ ] **Step 3: (Optional) Prove the component lights up with data**

If you want to see it render, temporarily set a rating on one product directly in the DB, reload the page, then revert:
```bash
psql -d ecom_dev -c "UPDATE \"Product\" SET \"ratingAvg\"=4.5, \"ratingCount\"=12 WHERE id='$PID';"
# open http://localhost:5001/products/$PID → "★★★★★ 4.50 (12)" with aria-label
psql -d ecom_dev -c "UPDATE \"Product\" SET \"ratingAvg\"=NULL, \"ratingCount\"=0 WHERE id='$PID';"
```
Expected: with data, the stars + "4.50" + "(12)" render; after revert, the line disappears. (Leave the DB back at null/0.)

- [ ] **Step 4: Stop the servers and record the result**

Stop both; free the ports. Note the smoke outcome. Do NOT push.

---

## Post-implementation (not a code task)

- Update `docs/IMPLEMENTATION_PLAN.md` M3 line per RULE.md §2: note "M3a Slice 4 (rating columns F2 + placeholders) done — **M3a COMPLETE**".
- M3a is the last M3a slice: per RULE.md §6, produce the phase/sub-phase resume prompt and STOP for verification.

---

## Self-Review

**Spec coverage:**
- Migration F2 (additive cols, file-diff authoring, `migrate deploy`, P1010 user-URL, sibling-survival check) → Task 1. ✓
- API auto-exposure (no code) verified over HTTP → Task 2. ✓
- Storefront `Product` rating fields + round-trip test → Task 3. ✓
- `RatingStars` component (renders when count>0; null otherwise; a11y label; tokens) + tests → Task 4. ✓
- Page wiring after `SellerLink` → Task 5. ✓
- Verification (migrate status + sibling survival + curl + suite/lint/build + SSR smoke) → Tasks 1,2,5,6. ✓
- Out of scope (population, card ratings, admin, F1/Review) → not present in any task. ✓

**Placeholder scan:** All code/SQL/command steps are complete and literal. Verification tasks (2, 6) list exact commands + concrete expected outputs. No "TBD"/"add validation"/"similar to Task N". Task 3 Step 4 note about cross-fixture compile breaks is concrete (names the likely file + the exact fields to add) rather than vague.

**Type consistency:** `ratingAvg: string | null` + `ratingCount: number` are identical across Task 3 (type + fixture), Task 4 (component props + tests), and Task 5 (page passes `product.ratingAvg`/`product.ratingCount`). The migration's `DECIMAL(3,2)` (Prisma `Decimal`) serializes to the `string | null` the storefront type declares; `INTEGER DEFAULT 0` → `number`. The component's `aria-label` string (`Rated ${ratingAvg} out of 5 from ${ratingCount} reviews`) matches the Task 4 test's `getByLabelText` exactly, and the smoke test (Task 6) greps the stable substring `out of 5 from`.
