# M2 Slice 6b — Seller "My Products" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a seller a self-serve catalog in the portal: a `/seller/products` list (pagination + status row-actions) and create/edit forms, all seller-scoped via the `/seller/products` API, replacing the `SellerComingSoon` placeholder from 6a.

**Architecture:** `apps/admin` (React+Vite+TS). Mirror the admin `ProductsPage`/`ProductNewPage`/`ProductEditPage` as `SellerProductsPage`/`SellerProductNewPage`/`SellerProductEditPage`, reusing the existing presentational components (`ProductForm`, `StatusBadge`, `Pagination`, `RowActionsMenu`) verbatim — the only differences are the `lib/sellerProducts` client (vs `lib/products`) and the `/seller/products` nav/route paths. Extend `lib/sellerProducts.ts` with the seller create/get/update/archive/setActive functions. Wire the three pages into the `SellerOnlyRoute` group, replacing the placeholder.

**Tech Stack:** React 18 + Vite + TS (strict), react-router-dom, Vitest + RTL. Reuses `ProductForm` (takes `categories: CategoryOption[]` + `initial?` + `onSubmit`), `StatusBadge`, `Pagination`, `RowActionsMenu`, and `lib/categories` (`listCategories`/`flattenCategories` — `GET /categories` is `@Public()`, so a seller can read it).

## Global Constraints

- All seller pages live under `SellerOnlyRoute` (6a) — UX-only gating; the API enforces seller scoping + `SellerApprovedGuard`. A seller only ever sees/mutates their own products (the API 404s cross-tenant; surface a not-found state).
- Reuse the existing presentational components + semantic surface tokens; **no hardcoded hex**; match the admin pages' structure (cancellation-guarded fetch, step-back-on-empty, row-action menu, `window.confirm` for archive — consistent with the admin pages; the accessible-modal migration is an app-wide M7d follow-up, not this slice).
- Strict TypeScript, no `any`. Functional components + hooks.
- Reuse, don't reinvent: import `ProductForm`/`StatusBadge`/`Pagination`/`RowActionsMenu` unchanged. Do NOT fork them. The seller pages differ from the admin pages only by client + paths + the "Add product" → `/seller/products/new` link and edit → `/seller/products/:id/edit`.
- Admin product pages/routes are UNCHANGED.
- Admin commands: `npm test`, `npm run lint`, `npm run build` (tsc+vite — real type gate). Verify per-task with `npm run build` (not nest — this is the vite app). Runtime smoke against API `:5000` + admin `:5002` with the seeded `seller@example.com` / `Password123!` (no Playwright — component tests + integration smoke + user click-through).
- No `git push` without explicit permission (RULE.md §3). Branch: `feat/seller-system`.
- The `.claude/worktrees/improvment-UI` worktree is an active other-agent worktree (merged to main) — ignore; never touch.

## File Structure

- `apps/admin/src/lib/sellerProducts.ts` (modify) — add `getSellerProduct`, `createSellerProduct`, `updateSellerProduct`, `archiveSellerProduct`, `setSellerProductActive` (mirror `lib/products.ts`'s signatures, hit `/seller/products*`). Reuse `CreateProductInput`/`UpdateProductInput` types from `./products`.
- `apps/admin/src/lib/sellerProducts.test.ts` (modify) — add tests for the new functions (path + method assertions).
- `apps/admin/src/pages/SellerProductsPage.tsx` (new) + `.test.tsx` — seller products list (mirrors `ProductsPage`).
- `apps/admin/src/pages/SellerProductNewPage.tsx` (new) + `.test.tsx` — create form (mirrors `ProductNewPage`).
- `apps/admin/src/pages/SellerProductEditPage.tsx` (new) + `.test.tsx` — edit form (mirrors `ProductEditPage`).
- `apps/admin/src/router.tsx` (modify) — replace the `seller/products` `SellerComingSoon` placeholder with the list page; add `seller/products/new` + `seller/products/:id/edit` under `SellerOnlyRoute`.

---

### Task 1: Extend the seller products client (create/get/update/archive/setActive)

**Files:**
- Modify: `apps/admin/src/lib/sellerProducts.ts`
- Modify: `apps/admin/src/lib/sellerProducts.test.ts`

**Interfaces:**
- Consumes: `apiClient`, `Product`/`CreateProductInput`/`UpdateProductInput` from `./products`.
- Produces:
  - `getSellerProduct(id: string): Promise<Product>` → `GET /seller/products/:id`
  - `createSellerProduct(input: CreateProductInput): Promise<Product>` → `POST /seller/products`
  - `updateSellerProduct(id: string, input: UpdateProductInput): Promise<Product>` → `PATCH /seller/products/:id`
  - `archiveSellerProduct(id: string): Promise<Product>` → `POST /seller/products/:id/archive`
  - `setSellerProductActive(id: string, active: boolean): Promise<Product>` → `PATCH /seller/products/:id/active`
  (All mirror the admin `lib/products.ts` functions, swapping `/products` → `/seller/products`.)

- [ ] **Step 1: Add failing tests**

In `apps/admin/src/lib/sellerProducts.test.ts`, add (mirroring the existing `listSellerProducts` tests + the admin `products.test.ts` mutation tests — read both):

```ts
import {
  listSellerProducts,
  getSellerProduct,
  createSellerProduct,
  updateSellerProduct,
  archiveSellerProduct,
  setSellerProductActive,
} from './sellerProducts';
// (apiClient already mocked at top of file)

describe('seller product mutations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getSellerProduct GETs /seller/products/:id', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });
    await getSellerProduct('p1');
    expect(apiClient.request).toHaveBeenCalledWith('/seller/products/p1');
  });

  it('createSellerProduct POSTs /seller/products with a pruned body', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });
    await createSellerProduct({
      name: 'X', sku: 'X1', description: 'd', price: 5, categoryId: 'c1',
    });
    expect(apiClient.request).toHaveBeenCalledWith('/seller/products', {
      method: 'POST',
      body: JSON.stringify({ name: 'X', sku: 'X1', description: 'd', price: 5, categoryId: 'c1' }),
    });
  });

  it('updateSellerProduct PATCHes /seller/products/:id', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });
    await updateSellerProduct('p1', {
      name: 'X', description: 'd', price: 5, categoryId: 'c1',
    });
    expect(apiClient.request).toHaveBeenCalledWith('/seller/products/p1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'X', description: 'd', price: 5, categoryId: 'c1' }),
    });
  });

  it('archiveSellerProduct POSTs /seller/products/:id/archive', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });
    await archiveSellerProduct('p1');
    expect(apiClient.request).toHaveBeenCalledWith('/seller/products/p1/archive', { method: 'POST' });
  });

  it('setSellerProductActive PATCHes /seller/products/:id/active with {active}', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });
    await setSellerProductActive('p1', false);
    expect(apiClient.request).toHaveBeenCalledWith('/seller/products/p1/active', {
      method: 'PATCH',
      body: JSON.stringify({ active: false }),
    });
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd apps/admin && npm test -- sellerProducts`
Expected: FAIL — the new functions aren't exported.

- [ ] **Step 3: Implement the functions**

In `apps/admin/src/lib/sellerProducts.ts`, import the input types and add the functions (mirror `lib/products.ts` exactly, swapping the path; reuse a local `pruneUndefined` like `products.ts` has):

```ts
import { apiClient } from './apiClient';
import type {
  Paginated,
  Product,
  ListProductsQuery,
  CreateProductInput,
  UpdateProductInput,
} from './products';

// ...existing toQuery + listSellerProducts...

function pruneUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

export function getSellerProduct(id: string): Promise<Product> {
  return apiClient.request<Product>(`/seller/products/${id}`);
}

export function createSellerProduct(input: CreateProductInput): Promise<Product> {
  return apiClient.request<Product>('/seller/products', {
    method: 'POST',
    body: JSON.stringify(pruneUndefined(input)),
  });
}

export function updateSellerProduct(
  id: string,
  input: UpdateProductInput,
): Promise<Product> {
  return apiClient.request<Product>(`/seller/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(pruneUndefined(input)),
  });
}

export function archiveSellerProduct(id: string): Promise<Product> {
  return apiClient.request<Product>(`/seller/products/${id}/archive`, {
    method: 'POST',
  });
}

export function setSellerProductActive(
  id: string,
  active: boolean,
): Promise<Product> {
  return apiClient.request<Product>(`/seller/products/${id}/active`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  });
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `cd apps/admin && npm test -- sellerProducts`
Expected: PASS (existing list tests + 5 new).

- [ ] **Step 5: Lint + build**

Run: `cd apps/admin && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/lib/sellerProducts.ts apps/admin/src/lib/sellerProducts.test.ts
git commit -m "feat(admin): seller product mutations client (get/create/update/archive/setActive)"
```

---

### Task 2: SellerProductsPage (list + status actions)

**Files:**
- Create: `apps/admin/src/pages/SellerProductsPage.tsx`
- Create: `apps/admin/src/pages/SellerProductsPage.test.tsx`

**Interfaces:**
- Consumes: `listSellerProducts`, `archiveSellerProduct`, `setSellerProductActive` (Task 1); `StatusBadge`, `Pagination`, `RowActionsMenu` (existing).
- Produces: `SellerProductsPage` — the seller products list. Identical behavior to `ProductsPage` but: title "My products", "Add product" → `/seller/products/new`, edit link → `/seller/products/:id/edit`, and the seller client.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/pages/SellerProductsPage.test.tsx` (mirror `ProductsPage.test.tsx` — READ it for the mock + MemoryRouter render pattern; mock `../lib/sellerProducts`). Cover: renders rows from `listSellerProducts`; "Add product" links to `/seller/products/new`; an edit action links to `/seller/products/:id/edit`; archive calls `archiveSellerProduct` (after confirm); toggle calls `setSellerProductActive`. Match the admin test's assertions, swapping the client + paths.

```ts
// key assertions (adapt to ProductsPage.test.tsx's structure):
// - getByRole('link', { name: /add product/i }) -> href '/seller/products/new'
// - listSellerProducts mocked to return 1 product -> its name renders
// - edit link href '/seller/products/<id>/edit'
// - window.confirm stubbed true; archive button -> archiveSellerProduct(id) called
// - toggle button -> setSellerProductActive(id, true/false) called
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd apps/admin && npm test -- SellerProductsPage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SellerProductsPage**

Create `apps/admin/src/pages/SellerProductsPage.tsx` by copying `ProductsPage.tsx` and changing ONLY:
- imports: `listProducts`/`archiveProduct`/`setProductActive` → `listSellerProducts`/`archiveSellerProduct`/`setSellerProductActive` from `../lib/sellerProducts`.
- the calls inside the effect + actions accordingly.
- header title "Products" → "My products".
- "Add product" `Link to="/products/new"` → `to="/seller/products/new"`.
- edit `Link to={\`/products/${product.id}/edit\`}` → `to={\`/seller/products/${product.id}/edit\`}`.
- the empty state copy may stay "No products yet." (fine for a seller too).
Everything else (cancellation-guarded fetch, step-back-on-empty, RowActionsMenu, Pagination, StatusBadge, error/Try-again, semantic tokens) is identical. Keep `window.confirm` for archive (consistent with the admin page).

- [ ] **Step 4: Run — verify it passes**

Run: `cd apps/admin && npm test -- SellerProductsPage`
Expected: PASS.

- [ ] **Step 5: Lint + build**

Run: `cd apps/admin && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/pages/SellerProductsPage.tsx apps/admin/src/pages/SellerProductsPage.test.tsx
git commit -m "feat(admin): SellerProductsPage — seller-scoped product list + status actions"
```

---

### Task 3: SellerProductNewPage + SellerProductEditPage (create/edit forms)

**Files:**
- Create: `apps/admin/src/pages/SellerProductNewPage.tsx` + `.test.tsx`
- Create: `apps/admin/src/pages/SellerProductEditPage.tsx` + `.test.tsx`

**Interfaces:**
- Consumes: `ProductForm` (existing — `{ categories, initial?, onSubmit }`), `listCategories`/`flattenCategories` (`lib/categories`), `createSellerProduct`/`getSellerProduct`/`updateSellerProduct` (Task 1).
- Produces: `SellerProductNewPage` (create form → on submit `createSellerProduct` → navigate `/seller/products`); `SellerProductEditPage` (loads the product via `getSellerProduct(id)` + categories, edit form → `updateSellerProduct` → navigate `/seller/products`).

- [ ] **Step 1: Write the failing tests**

Create both test files, mirroring `ProductNewPage.test.tsx` / `ProductEditPage.test.tsx` (read them). Mock `../lib/sellerProducts` + `../lib/categories`. Cover:
- New: renders the form (categories loaded via `listCategories`); submitting calls `createSellerProduct(payload)` then navigates to `/seller/products`.
- Edit: loads the product via `getSellerProduct(id)` + categories, pre-fills the form; submit calls `updateSellerProduct(id, payload)` then navigates `/seller/products`.
Match the admin tests' structure (they likely mock `useNavigate`); swap client + the back-link/navigate paths to `/seller/products`.

- [ ] **Step 2: Run — verify they fail**

Run: `cd apps/admin && npm test -- SellerProductNewPage SellerProductEditPage`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the two pages**

Create `SellerProductNewPage.tsx` by copying `ProductNewPage.tsx`, changing ONLY: `createProduct` → `createSellerProduct`; `navigate('/products')` → `navigate('/seller/products')`; the back `Link to="/products"` → `to="/seller/products"`; header copy "New product" stays or becomes "New product". Categories loading (`listCategories`/`flattenCategories`) is unchanged (categories are public).

Create `SellerProductEditPage.tsx` by copying `ProductEditPage.tsx`, changing ONLY: `getProduct` → `getSellerProduct`, `updateProduct` → `updateSellerProduct`; `navigate('/products')` → `navigate('/seller/products')`; back `Link to="/products"` → `to="/seller/products"`. The not-found path (when `getSellerProduct` 404s — which is also what a cross-tenant id returns) should render the existing not-found/error UI the admin edit page uses; a seller hitting another seller's product id gets that same "not found" treatment (correct — the API 404s it).

- [ ] **Step 4: Run — verify they pass**

Run: `cd apps/admin && npm test -- SellerProductNewPage SellerProductEditPage`
Expected: PASS.

- [ ] **Step 5: Lint + build**

Run: `cd apps/admin && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/pages/SellerProductNewPage.tsx apps/admin/src/pages/SellerProductNewPage.test.tsx apps/admin/src/pages/SellerProductEditPage.tsx apps/admin/src/pages/SellerProductEditPage.test.tsx
git commit -m "feat(admin): seller product create/edit pages (scoped, reuse ProductForm)"
```

---

### Task 4: Wire the seller product routes (replace the placeholder)

**Files:**
- Modify: `apps/admin/src/router.tsx`

**Interfaces:**
- Consumes: `SellerProductsPage` (Task 2), `SellerProductNewPage`/`SellerProductEditPage` (Task 3).
- Produces: under the `SellerOnlyRoute` group, `seller/products` → `SellerProductsPage`, `seller/products/new` → `SellerProductNewPage`, `seller/products/:id/edit` → `SellerProductEditPage`. The `seller/products` `SellerComingSoon` placeholder is removed; `seller/inventory` keeps its placeholder (6d replaces it).

- [ ] **Step 1: Replace the placeholder + add the form routes**

In `apps/admin/src/router.tsx`, import the three pages and update the `SellerOnlyRoute` group:

```tsx
import { SellerProductsPage } from './pages/SellerProductsPage';
import { SellerProductNewPage } from './pages/SellerProductNewPage';
import { SellerProductEditPage } from './pages/SellerProductEditPage';
// ...
          {
            element: <SellerOnlyRoute />,
            children: [
              { path: 'seller/products', element: <SellerProductsPage /> },
              { path: 'seller/products/new', element: <SellerProductNewPage /> },
              { path: 'seller/products/:id/edit', element: <SellerProductEditPage /> },
              { path: 'seller/inventory', element: <SellerComingSoon area="Inventory" /> },
            ],
          },
```

(Keep `SellerComingSoon` imported for the inventory placeholder; it's removed in 6d. Route order: `seller/products/new` is a literal and must be registered so it isn't shadowed by `seller/products/:id/edit` — but they're different path depths (`/new` vs `/:id/edit`), so no conflict; react-router matches them distinctly. The list `seller/products` and `seller/products/new` differ by segment count too. No ordering trap here.)

- [ ] **Step 2: Build + full test suite**

Run: `cd apps/admin && npm run build && npm test`
Expected: build clean; full suite green (existing 190 + the new sellerProducts/list/new/edit tests).

- [ ] **Step 3: Lint**

Run: `cd apps/admin && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/router.tsx
git commit -m "feat(admin): wire seller product routes (list/new/edit), replace placeholder"
```

---

### Task 5: Sub-slice gate + runtime smoke + tracker

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md`

- [ ] **Step 1: Full admin gate**

Run from `apps/admin`: `npm test` (full), `npm run lint`, `npm run build`. From repo root: `git status --porcelain` (clean), `git worktree list` (ignore the `improvment-UI` other-agent worktree).
Expected: all green.

- [ ] **Step 2: Runtime integration smoke**

Boot API (`:5000`) + admin (`:5002`); seed if needed. As the seeded seller (`seller@example.com` / `Password123!`), exercise the real endpoints the pages call:
- `GET /seller/products` (list) → 200 with the 2 demo products.
- `POST /seller/products` with a valid body (use a public category id from `GET /categories`) → 201, owned by the seller; then `GET /seller/products/:id` → 200; `PATCH /seller/products/:id` → 200; `POST /seller/products/:id/archive` → 200/expected. Clean up the created product.
Report the statuses. (Browser pixels are the user's click-through per the agreed approach — note it.)

- [ ] **Step 3: Update tracker**

In `docs/IMPLEMENTATION_PLAN.md`, append to the M2 row: "6b My Products (seller products list + create/edit + status actions at /seller/products) done; next: 6c CSV upload."

- [ ] **Step 4: Commit**

```bash
git add docs/IMPLEMENTATION_PLAN.md
git commit -m "docs(m2): mark slice 6b (seller My Products) done"
```

- [ ] **Step 5: STOP and ask the user to verify (RULE.md §1)**

Summarize; suggest the user click-through (log in as the seller → My Products → add/edit/archive a product). Note 6c (CSV upload) is next. Do not push.

---

## Self-Review

**Spec coverage (against `2026-06-22-m2-slice6-admin-seller-portal-ui-design.md` §6b):**
- Seller products list (pagination, status actions) → Task 2. ✓
- Create/edit forms → Task 3 (reuse `ProductForm`). ✓
- Hits `/seller/products` (scoped) → Task 1 client; cross-tenant 404 surfaced as the edit page's not-found state → Task 3. ✓
- Replaces the 6a `SellerComingSoon` placeholder → Task 4. ✓
- Admin product pages unchanged → only new files + the router's seller group touched. ✓

**Placeholder scan:** No TBD/TODO. Task 2/3 say "copy the admin page, change ONLY X" with the exact change-list rather than re-pasting ~230 lines — this is a precise, bounded instruction (the admin source is in the repo to copy from), not vagueness; the test assertions to add are enumerated. This is the DRY-acceptable way to mirror a cohesive existing page.

**Type consistency:** new client fns (Task 1) reuse `Product`/`CreateProductInput`/`UpdateProductInput` from `./products` and return `Promise<Product>` — consumed by the pages (Tasks 2,3). `ProductForm`'s `{ categories, initial?, onSubmit }` contract is reused unchanged. Routes (Task 4) reference the three page components defined in Tasks 2,3.

**Reuse note:** `ProductForm`, `StatusBadge`, `Pagination`, `RowActionsMenu`, `lib/categories` are reused verbatim — no forking. The seller pages are parallel to the admin pages (not a shared parametrized component) because they diverge in small path/label ways and 6e will add a seller-specific concern; a parametrized mega-page would be premature abstraction (design §Conventions). The one duplicated helper (`pruneUndefined`, ~3 lines, already duplicated between products.ts and would-be sellerProducts.ts) is acceptable DRY at the client seam; the `toQuery` triplication is already logged for the M2 final-review cleanup.
