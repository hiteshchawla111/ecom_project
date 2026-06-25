# M2 Slice 6e — Admin "Sold By" Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the owning seller on the admin product views — add a public-safe `seller { displayName, slug }` projection to the product API response, and a "Sold by" column on the admin `ProductsPage`. This is the one admin-side requirement of the slice-6 design and the **final M2 slice**.

**Architecture:** Two small changes. (1) API: add `seller: { select: { displayName: true, slug: true } }` to the shared `PRODUCT_INCLUDE` in `products.service.ts` (used by both `findOne` and the list `findMany`) + reflect it in the product response type. Every product read (admin, public storefront, seller portal) gains a `seller` object — public-safe (shop name + slug, no PII) and the M3a "sold by" direction. (2) Admin: add `seller?` to the admin `Product` type and a "Sold by" column to `ProductsPage` (the admin cross-seller list); the seller's own "My Products" page does NOT need it (everything there is theirs).

**Tech Stack:** NestJS + Prisma 7 (API); React + Vite + TS (admin). Jest (API) / Vitest + RTL (admin).

## Global Constraints

- Public-safe projection only: `displayName` + `slug` (the shop name + public slug). NEVER include KYC/PII fields (gstin/pan/bank/etc.) — those are encrypted + masked elsewhere; the `select` lists exactly the two safe fields.
- The projection goes on the SHARED `PRODUCT_INCLUDE` (used by admin/public/seller reads) — confirmed acceptable: it's public-safe and matches M3a. The admin unit-test asserts `where`/`data`, not the `include` shape, so adding `seller` won't break it (verified).
- Strict TypeScript, no `any` (both apps). No hardcoded hex (admin column uses semantic tokens).
- The admin "Sold by" column goes on `ProductsPage` (admin cross-seller view) only. Do NOT add it to `SellerProductsPage` (a seller's own catalog — redundant). Admin `Product` type gains `seller?: { displayName: string; slug: string }` (optional — defensive).
- Verify API with `npx tsc -p tsconfig.build.json --noEmit` (0 errors) + boot (not nest-build exit). Verify admin with `npm run build` (tsc+vite). Runtime-smoke the admin `GET /products` returns `seller`.
- No `git push` without explicit permission (RULE.md §3). Branch: `feat/seller-system`.
- The `.claude/worktrees/improvment-UI` worktree is an active other-agent worktree (merged to main) — ignore; never touch.

## File Structure

- `apps/api/src/products/products.service.ts` (modify) — add `seller: { select: { displayName: true, slug: true } }` to `PRODUCT_INCLUDE`.
- `apps/api/src/products/products.service.spec.ts` (modify, if needed) — only if a test asserts the exact include; otherwise no change (the existing tests assert `where`/`data`, not `include`).
- `apps/admin/src/lib/products.ts` (modify) — add `seller?: { displayName: string; slug: string }` to the `Product` interface.
- `apps/admin/src/pages/ProductsPage.tsx` (modify) — add a "Sold by" column (header + cell) between Status and Actions.
- `apps/admin/src/pages/ProductsPage.test.tsx` (modify) — assert the "Sold by" header + a seller name renders for a product.

---

### Task 1: API — add the seller projection to PRODUCT_INCLUDE

**Files:**
- Modify: `apps/api/src/products/products.service.ts`
- Modify (if needed): `apps/api/src/products/products.service.spec.ts`

**Interfaces:**
- Produces: every product read (`findOne` + list `findMany`, which both use `PRODUCT_INCLUDE`) now includes `seller: { displayName: string; slug: string }`. Public-safe.

- [ ] **Step 1: Add the seller projection to PRODUCT_INCLUDE**

In `apps/api/src/products/products.service.ts`, change:

```ts
const PRODUCT_INCLUDE = {
  category: true,
  images: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.ProductInclude;
```

to:

```ts
const PRODUCT_INCLUDE = {
  category: true,
  images: { orderBy: { position: 'asc' as const } },
  // The owning seller — public-safe fields only (shop name + slug; never KYC/PII).
  seller: { select: { displayName: true, slug: true } },
} satisfies Prisma.ProductInclude;
```

- [ ] **Step 2: Run the product service spec — confirm it still passes (the include isn't asserted)**

Run: `cd apps/api && npm test -- products.service`
Expected: PASS unchanged — the existing tests assert `where`/`data`/pagination, not the `include` contents, so adding `seller` doesn't break them. If a test DOES assert the exact include and now fails, update that assertion to include the `seller` projection (do not remove the new projection).

- [ ] **Step 3: tsc + full API suite**

Run: `cd apps/api && npx tsc -p tsconfig.build.json --noEmit && npm test`
Expected: 0 tsc errors; full API suite green (the `satisfies Prisma.ProductInclude` confirms the projection is a valid include; the response type widens to include `seller`).

- [ ] **Step 4: Boot + smoke — GET /products returns seller**

Run `npm run start:dev` (background); poll `localhost:5000/products` for 200; then:
```bash
curl -s "localhost:5000/products?pageSize=1" | python3 -c "import sys,json;d=json.load(sys.stdin);p=d['data'][0];print('seller:', p.get('seller'))"
```
Expected: prints `seller: {'displayName': '...', 'slug': '...'}` (e.g. the Platform seller or a demo seller). Confirm NO kyc/pan/gstin/bank keys are present in `seller`. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/products/products.service.ts apps/api/src/products/products.service.spec.ts 2>/dev/null
git commit -m "feat(m2): product API includes owning seller (displayName, slug) — public-safe"
```

---

### Task 2: Admin — "Sold by" column on ProductsPage

**Files:**
- Modify: `apps/admin/src/lib/products.ts`
- Modify: `apps/admin/src/pages/ProductsPage.tsx`
- Modify: `apps/admin/src/pages/ProductsPage.test.tsx`

**Interfaces:**
- Consumes: the product API's new `seller` projection (Task 1).
- Produces: admin `Product` type gains `seller?: { displayName: string; slug: string }`; `ProductsPage` renders a "Sold by" column showing `product.seller?.displayName` (fallback `—`).

- [ ] **Step 1: Add `seller` to the admin Product type**

In `apps/admin/src/lib/products.ts`, add to the `Product` interface (after `categoryId`):

```ts
export interface Product {
  id: string;
  name: string;
  sku: string;
  description: string;
  price: string;
  salePrice: string | null;
  brand: string | null;
  status: ProductStatus;
  categoryId: string;
  /** The owning seller (public-safe fields). Optional — defensive if absent. */
  seller?: { displayName: string; slug: string };
}
```

- [ ] **Step 2: Write the failing test**

In `apps/admin/src/pages/ProductsPage.test.tsx`, add a test asserting the "Sold by" header + a seller name renders (read the file for its `listProducts` mock + render pattern; include `seller` on a mocked product):

```ts
it('shows a "Sold by" column with the owning seller name', async () => {
  // mock listProducts to return one product with a seller (adapt to the file's helper)
  // e.g. { ...baseProduct, seller: { displayName: 'Demo Shop', slug: 'demo-shop' } }
  // render the page, wait for the row
  expect(await screen.findByRole('columnheader', { name: /sold by/i })).toBeInTheDocument();
  expect(screen.getByText('Demo Shop')).toBeInTheDocument();
});
```

(Match the existing test's mock construction. If the file has a `product()` factory, extend it with an optional `seller`. Also confirm an existing test that mocks a product WITHOUT a seller still passes — the cell should render `—`, not crash; if needed add/adjust so a seller-less product shows the fallback.)

- [ ] **Step 3: Run — verify it fails**

Run: `cd apps/admin && npm test -- ProductsPage`
Expected: FAIL — no "Sold by" column yet.

- [ ] **Step 4: Add the column to ProductsPage**

In `apps/admin/src/pages/ProductsPage.tsx`, add a header between Status and Actions:

```tsx
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Sold by
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Actions
                </th>
```

And the matching cell in the row (between the Status `<td>` and the Actions `<td>`):

```tsx
                    <td className="px-4 py-2">
                      <StatusBadge status={product.status} />
                    </td>
                    <td className="px-4 py-2 text-content-muted">
                      {product.seller?.displayName ?? '—'}
                    </td>
                    <td className="px-4 py-2">
                      {/* ...existing Actions cell... */}
```

(The column order becomes: Name · SKU · Price · Status · Sold by · Actions. The cell uses `text-content-muted` like SKU; fallback `—` when seller is absent — defensive, no crash.)

- [ ] **Step 5: Run — verify it passes**

Run: `cd apps/admin && npm test -- ProductsPage`
Expected: PASS — the new test + all existing ProductsPage tests (the column addition shifts cell positions; if any existing test asserts by column index/cell order it may need its expectation updated — prefer role/text queries; only adjust if a positional assertion breaks, and keep its intent).

- [ ] **Step 6: Lint + build**

Run: `cd apps/admin && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/lib/products.ts apps/admin/src/pages/ProductsPage.tsx apps/admin/src/pages/ProductsPage.test.tsx
git commit -m "feat(admin): 'Sold by' column on the admin products list"
```

---

### Task 3: Slice gate + runtime smoke + tracker (completes M2)

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md` (M2 row → ✅ Done; M2 status table row → ✅)

- [ ] **Step 1: Full gate (both apps touched)**

Run from `apps/api`: `npm test`, `npx tsc -p tsconfig.build.json --noEmit` (0 errors), `npm run lint`, `npm run test:e2e`. From `apps/admin`: `npm test`, `npm run lint`, `npm run build`. From repo root: `git status --porcelain` (clean), `git worktree list` (ignore the `improvment-UI` other-agent worktree).
Expected: all green.

- [ ] **Step 2: Runtime smoke (admin "sold by" end-to-end)**

Boot API (`:5000`) + admin (`:5002`); seed. As ADMIN (`admin@example.com` / `Password123!`): `GET /products?pageSize=5` → each product has `seller: { displayName, slug }`; confirm at least one shows a real shop name (Platform / Demo Shop). (Browser pixels = user click-through: admin Products list shows the "Sold by" column.) Report the seller values seen + that no KYC keys appear.

- [ ] **Step 3: Mark M2 complete in the roadmap**

In `docs/IMPLEMENTATION_PLAN.md`:
- The M2 status-table row (top of the file): change `| M2 | Seller System | L | 🟡 ... |` to `| M2 | Seller System | L | ✅ Done |` (with a short completion note if the row carries one).
- The detailed M2 row: append "6e admin 'Sold by' (product API includes owning seller; admin products list column) done. **M2 — Seller System COMPLETE (slices 1–6).**"

- [ ] **Step 4: Commit**

```bash
git add docs/IMPLEMENTATION_PLAN.md
git commit -m "docs(m2): mark slice 6e + M2 Seller System complete"
```

- [ ] **Step 5: STOP — M2 phase complete**

M2 is now fully implemented (slices 1–6). This is a PHASE completion, so per RULE.md §6: after the §1 stop-and-verify, the controller runs the **whole-branch review** (the deferred-findings triage from slices 1–6) and produces the copy-pasteable **resume prompt**. Do NOT push. Summarize and hand off to that phase-completion flow.

---

## Self-Review

**Spec coverage (against `2026-06-22-m2-slice6-admin-seller-portal-ui-design.md` §6e):**
- API: `seller { displayName, slug }` added to `PRODUCT_INCLUDE` → Task 1. ✓
- Admin "Sold by" column on the products list → Task 2. ✓
- Public-safe (no KYC/PII) → Task 1 `select` lists only displayName+slug; smoke confirms no KYC keys. ✓
- M2 marked complete → Task 3. ✓

**Placeholder scan:** No TBD/TODO. Task 1 Step 2 is conditional ("update the assertion only if a test asserts the exact include") — a genuine guard, with the verified expectation that no such assertion exists. Task 2's test is enumerated; the column placement is given exactly.

**Type consistency:** API `PRODUCT_INCLUDE` projection (`seller: { select: { displayName, slug } }`) ↔ admin `Product.seller?: { displayName: string; slug: string }`. The admin field is optional (defensive: cell falls back to `—`); the API always returns it (the relation is required since slice 1's B4), so in practice it's always present — optional is purely defensive against a future shape change. No `any`.

**Scope note:** the "Sold by" column is admin-only (`ProductsPage`), NOT on `SellerProductsPage` — a seller's own catalog doesn't need "sold by" (it's all theirs). The shared `PRODUCT_INCLUDE` change does surface `seller` on the public storefront + seller reads too, but those don't render it (yet — M3a) and it's public-safe; this is the intended forward-compatible direction, not scope creep.
