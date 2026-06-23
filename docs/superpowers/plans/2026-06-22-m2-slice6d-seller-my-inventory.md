# M2 Slice 6d — Seller "My Inventory" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a seller their stock management in the portal: a `/seller/inventory` stock list (available / reserved / low-stock, with a low-stock filter + pagination) and a per-product detail page with movement history + a post-movement form — all seller-scoped via `/seller/inventory`, replacing the last `SellerComingSoon` placeholder.

**Architecture:** `apps/admin`. Mirror the admin `InventoryPage`/`InventoryItemPage` as `SellerInventoryPage`/`SellerInventoryItemPage`, reusing the presentational components (`LowStockBadge`, `Pagination`) verbatim and the **types** from `lib/inventory` (`MovementView`, `MovementType`, `ManualMovementType`, `CreateMovementInput`). Extend `lib/sellerInventory.ts` (which already has `listSellerStock` + `SellerStockRow` from 6a) with `getSellerStockItem` + `createSellerMovement` and a `SellerStockItemView` type. Wire the two pages into `SellerOnlyRoute`, replacing the `seller/inventory` placeholder (and removing the now-unused `SellerComingSoon`).

**Tech Stack:** React 18 + Vite + TS (strict), react-router-dom, Vitest + RTL. Consumes the slice-5 `/seller/inventory` API: `GET /seller/inventory` (list, supports `lowStock`), `GET /seller/inventory/:productId` (detail + movements), `POST /seller/inventory/:productId/movements` (204).

## Global Constraints

- Seller-scoped + under `SellerOnlyRoute` — UX-only gating; the API enforces seller scoping + `SellerApprovedGuard`. A seller only sees/adjusts their own stock; a cross-tenant `:productId` 404s → surface the existing not-found state (the admin `InventoryItemPage` already handles `ApiError` 404).
- Reuse the merged UI's components + semantic tokens; **no hardcoded hex**. Mirror the admin pages' structure (cancellation-guarded fetch, low-stock filter, the movement form with its ADJUSTMENT-vs-delta validation, movement-history table).
- **Reuse types, don't duplicate:** import `MovementView`, `MovementType`, `ManualMovementType`, `CreateMovementInput` from `lib/inventory`. `SellerStockItemView = SellerStockRow & { movements: MovementView[] }` (SellerStockRow already exists in `sellerInventory.ts` from 6a and includes `isLowStock`). Do NOT redefine the movement types.
- Strict TypeScript, no `any`. Functional components + hooks.
- Admin inventory pages/routes UNCHANGED. `LowStockBadge`/`Pagination` reused unforked.
- Admin commands: `npm test`, `npm run lint`, `npm run build` (tsc+vite — real type gate). Runtime smoke against API `:5000` + admin `:5002` with the seeded `seller@example.com` (no Playwright — component tests + integration smoke + user click-through).
- No `git push` without explicit permission (RULE.md §3). Branch: `feat/seller-system`.
- The `.claude/worktrees/improvment-UI` worktree is an active other-agent worktree (merged to main) — ignore; never touch.

## File Structure

- `apps/admin/src/lib/sellerInventory.ts` (modify) — add `SellerStockItemView` (= `SellerStockRow & { movements: MovementView[] }`), `getSellerStockItem(productId): Promise<SellerStockItemView>` (`GET /seller/inventory/:productId`), `createSellerMovement(productId, input): Promise<void>` (`POST /seller/inventory/:productId/movements`). Reuse `MovementView`/`ManualMovementType`/`CreateMovementInput` from `./inventory`.
- `apps/admin/src/lib/sellerInventory.test.ts` (new) — tests for the new functions (path + method + body).
- `apps/admin/src/pages/SellerInventoryPage.tsx` (new) + `.test.tsx` — stock list (mirrors `InventoryPage`).
- `apps/admin/src/pages/SellerInventoryItemPage.tsx` (new) + `.test.tsx` — detail + movement form + history (mirrors `InventoryItemPage`).
- `apps/admin/src/router.tsx` (modify) — `seller/inventory` → `SellerInventoryPage`, `seller/inventory/:productId` → `SellerInventoryItemPage`, under `SellerOnlyRoute`; remove the `SellerComingSoon` placeholder + its now-unused import.
- `apps/admin/src/pages/SellerComingSoon.tsx` (delete) — no longer referenced after 6d (it was the 6a placeholder for products + inventory; both are real now).

## Decisions locked in (from the slice-6 design + this plan)

- Dedicated `SellerInventoryPage`/`SellerInventoryItemPage` mirroring the admin pages (parallel pages, not a parametrized shared component — the design's "no premature abstraction"); diverge only by the seller client + `/seller/inventory` paths.
- Reuse `lib/inventory`'s movement types to prevent type drift between the admin and seller inventory clients.
- `SellerComingSoon` is deleted once both its routes (products in 6b, inventory in 6d) host real pages.

---

### Task 1: Extend the seller inventory client (detail + movement)

**Files:**
- Modify: `apps/admin/src/lib/sellerInventory.ts`
- Create: `apps/admin/src/lib/sellerInventory.test.ts`

**Interfaces:**
- Consumes: `apiClient`; `SellerStockRow` (existing, 6a); `MovementView`, `ManualMovementType`, `CreateMovementInput` from `./inventory`.
- Produces:
  - `interface SellerStockItemView extends SellerStockRow { movements: MovementView[] }`
  - `getSellerStockItem(productId: string): Promise<SellerStockItemView>` → `GET /seller/inventory/:productId`
  - `createSellerMovement(productId: string, input: CreateMovementInput): Promise<void>` → `POST /seller/inventory/:productId/movements` (the API returns 204; call as `request<void>`).

- [ ] **Step 1: Write the failing tests**

Create `apps/admin/src/lib/sellerInventory.test.ts` (mirror the apiClient-mock pattern from `sellerProducts.test.ts` / `inventory.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from './apiClient';
import {
  listSellerStock,
  getSellerStockItem,
  createSellerMovement,
} from './sellerInventory';

vi.mock('./apiClient', () => ({ apiClient: { request: vi.fn() } }));

describe('sellerInventory client', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listSellerStock GETs /seller/inventory with pagination + lowStock', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [], page: 1, pageSize: 20, total: 0, totalPages: 1,
    });
    await listSellerStock({ page: 2, pageSize: 10, lowStock: true });
    expect(apiClient.request).toHaveBeenCalledWith(
      '/seller/inventory?page=2&pageSize=10&lowStock=true',
    );
  });

  it('getSellerStockItem GETs /seller/inventory/:productId', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue({});
    await getSellerStockItem('p1');
    expect(apiClient.request).toHaveBeenCalledWith('/seller/inventory/p1');
  });

  it('createSellerMovement POSTs /seller/inventory/:productId/movements', async () => {
    (apiClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    await createSellerMovement('p1', { type: 'ADDITION', quantity: 5, reason: 'restock' });
    expect(apiClient.request).toHaveBeenCalledWith('/seller/inventory/p1/movements', {
      method: 'POST',
      body: JSON.stringify({ type: 'ADDITION', quantity: 5, reason: 'restock' }),
    });
  });
});
```

(The `listSellerStock` test may already be covered elsewhere; if `sellerInventory.test.ts` didn't exist before, include it. If a listSellerStock test already exists in another file, keep this one focused on the two new functions. Match the existing query-string ordering that `listSellerStock`'s `toQuery` produces — verify by reading the 6a `sellerInventory.ts`.)

- [ ] **Step 2: Run — verify it fails**

Run: `cd apps/admin && npm test -- sellerInventory`
Expected: FAIL — `getSellerStockItem`/`createSellerMovement` not exported.

- [ ] **Step 3: Implement the functions + type**

In `apps/admin/src/lib/sellerInventory.ts`, add the import + the two functions + the view type:

```ts
import type {
  MovementView,
  ManualMovementType,
  CreateMovementInput,
} from './inventory';

// ...existing SellerStockRow, ListSellerStockQuery, toQuery, listSellerStock...

/** A seller's stock item with its movement history (mirrors the API StockItemView). */
export interface SellerStockItemView extends SellerStockRow {
  movements: MovementView[];
}

/** Fetch one of the seller's stock items + recent movements. */
export function getSellerStockItem(
  productId: string,
): Promise<SellerStockItemView> {
  return apiClient.request<SellerStockItemView>(`/seller/inventory/${productId}`);
}

/** Post a manual stock movement against the seller's own product. */
export function createSellerMovement(
  productId: string,
  input: CreateMovementInput,
): Promise<void> {
  return apiClient.request<void>(`/seller/inventory/${productId}/movements`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
```

(Re-export `ManualMovementType`/`MovementType`/`MovementView`/`CreateMovementInput` from this module too if the pages prefer importing them from `sellerInventory` — but simplest is to have the pages import the movement types from `./inventory` directly and the seller-specific view/fns from `./sellerInventory`. Pick one and be consistent. Do NOT redefine the movement types.)

- [ ] **Step 4: Run — verify it passes**

Run: `cd apps/admin && npm test -- sellerInventory`
Expected: PASS.

- [ ] **Step 5: Lint + build**

Run: `cd apps/admin && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/lib/sellerInventory.ts apps/admin/src/lib/sellerInventory.test.ts
git commit -m "feat(admin): seller inventory client — getSellerStockItem + createSellerMovement"
```

---

### Task 2: SellerInventoryPage (stock list + low-stock filter)

**Files:**
- Create: `apps/admin/src/pages/SellerInventoryPage.tsx`
- Create: `apps/admin/src/pages/SellerInventoryPage.test.tsx`

**Interfaces:**
- Consumes: `listSellerStock`, `SellerStockRow` (Task 1 / 6a); `LowStockBadge`, `Pagination` (existing).
- Produces: `SellerInventoryPage` — the seller stock list. Mirrors `InventoryPage` but: title "My inventory", the row "View"/detail link → `/seller/inventory/:productId`, and the seller client.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/pages/SellerInventoryPage.test.tsx` (mirror `InventoryPage.test.tsx` — READ it for the mock + MemoryRouter pattern; mock `../lib/sellerInventory`). Cover: renders rows from `listSellerStock` (name/sku/available/reserved + LowStockBadge); the detail link href is `/seller/inventory/:productId`; the low-stock filter toggle refetches with `lowStock: true`; pagination present. Match the admin test's assertions, swapping client + paths.

- [ ] **Step 2: Run — verify it fails**

Run: `cd apps/admin && npm test -- SellerInventoryPage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SellerInventoryPage**

Create `apps/admin/src/pages/SellerInventoryPage.tsx` by copying `InventoryPage.tsx` (READ it) and changing ONLY:
- imports: `listStock`/`StockRow` (from `../lib/inventory`) → `listSellerStock`/`SellerStockRow` (from `../lib/sellerInventory`).
- the `listStock(...)` call → `listSellerStock(...)`.
- title "Inventory" → "My inventory".
- the detail link `to={\`/inventory/${r.productId}\`}` → `to={\`/seller/inventory/${r.productId}\`}`.
- everything else identical: the cancellation-guarded fetch, low-stock filter checkbox, LowStockBadge, Pagination, error handling, semantic tokens, PAGE_SIZE.
Reuse `LowStockBadge`/`Pagination` unchanged.

- [ ] **Step 4: Run — verify it passes**

Run: `cd apps/admin && npm test -- SellerInventoryPage`
Expected: PASS.

- [ ] **Step 5: Lint + build**

Run: `cd apps/admin && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/pages/SellerInventoryPage.tsx apps/admin/src/pages/SellerInventoryPage.test.tsx
git commit -m "feat(admin): SellerInventoryPage — seller-scoped stock list + low-stock filter"
```

---

### Task 3: SellerInventoryItemPage (detail + movement form + history)

**Files:**
- Create: `apps/admin/src/pages/SellerInventoryItemPage.tsx`
- Create: `apps/admin/src/pages/SellerInventoryItemPage.test.tsx`

**Interfaces:**
- Consumes: `getSellerStockItem`, `createSellerMovement`, `SellerStockItemView` (Task 1); `MovementType`/`ManualMovementType` (from `./inventory`); `LowStockBadge` (existing); `ApiError` (`lib/types`).
- Produces: `SellerInventoryItemPage` — counters (available/reserved/threshold), the post-movement form (ADDITION/DEDUCTION/ADJUSTMENT with the same client-side validation as the admin page: ADJUSTMENT min 0, others min 1, reason required), and the movement-history table. Cross-tenant `:productId` → 404 → not-found state.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/pages/SellerInventoryItemPage.test.tsx` (mirror `InventoryItemPage.test.tsx` — READ it; mock `../lib/sellerInventory`). Cover: loads via `getSellerStockItem(productId)`, renders counters + movement history; posting a valid movement calls `createSellerMovement(productId, {type,quantity,reason})` then refetches; the back link → `/seller/inventory`; a 404 from `getSellerStockItem` (an `ApiError` with status 404) renders the not-found state. Match the admin test's structure, swapping client + paths.

- [ ] **Step 2: Run — verify it fails**

Run: `cd apps/admin && npm test -- SellerInventoryItemPage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SellerInventoryItemPage**

Create `apps/admin/src/pages/SellerInventoryItemPage.tsx` by copying `InventoryItemPage.tsx` (READ it — ~284 lines) and changing ONLY:
- imports: `getStockItem`/`createMovement`/`StockItemView` (from `../lib/inventory`) → `getSellerStockItem`/`createSellerMovement`/`SellerStockItemView` (from `../lib/sellerInventory`). Keep `ManualMovementType`/`MovementType` imported from `../lib/inventory` (reused types).
- the `getStockItem(productId!)` call → `getSellerStockItem(productId!)`; `createMovement(productId, ...)` → `createSellerMovement(productId, ...)`.
- the two back-links `to="/inventory"` → `to="/seller/inventory"`.
- the `useState<StockItemView | null>` → `useState<SellerStockItemView | null>`.
- everything else identical: the ADJUSTMENT-vs-delta validation (min 0 vs min 1, reason required), the counters `<dl>`, the movement form, the history table, the 404/loadError/notFound handling, semantic tokens, `LowStockBadge`.

- [ ] **Step 4: Run — verify it passes**

Run: `cd apps/admin && npm test -- SellerInventoryItemPage`
Expected: PASS.

- [ ] **Step 5: Lint + build**

Run: `cd apps/admin && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/pages/SellerInventoryItemPage.tsx apps/admin/src/pages/SellerInventoryItemPage.test.tsx
git commit -m "feat(admin): SellerInventoryItemPage — stock detail + movement form + history"
```

---

### Task 4: Wire the seller inventory routes; remove the placeholder

**Files:**
- Modify: `apps/admin/src/router.tsx`
- Delete: `apps/admin/src/pages/SellerComingSoon.tsx`

**Interfaces:**
- Consumes: `SellerInventoryPage` (Task 2), `SellerInventoryItemPage` (Task 3).
- Produces: under `SellerOnlyRoute`, `seller/inventory` → `SellerInventoryPage`, `seller/inventory/:productId` → `SellerInventoryItemPage`. The `SellerComingSoon` placeholder + import are removed (both its routes — products in 6b, inventory now — are real pages).

- [ ] **Step 1: Replace the inventory placeholder + add the detail route**

In `apps/admin/src/router.tsx`: import `SellerInventoryPage` + `SellerInventoryItemPage`; remove the `SellerComingSoon` import; in the `SellerOnlyRoute` group, replace `{ path: 'seller/inventory', element: <SellerComingSoon area="Inventory" /> }` with:

```tsx
              { path: 'seller/inventory', element: <SellerInventoryPage /> },
              { path: 'seller/inventory/:productId', element: <SellerInventoryItemPage /> },
```

Verify no other reference to `SellerComingSoon` remains (`grep -rn SellerComingSoon apps/admin/src`).

- [ ] **Step 2: Delete the now-unused placeholder**

Run: `rm apps/admin/src/pages/SellerComingSoon.tsx`
(Confirm the grep from Step 1 returns nothing before deleting. If `SellerComingSoon.test.tsx` exists, delete it too.)

- [ ] **Step 3: Build + full suite + lint**

Run: `cd apps/admin && npm run build && npm test && npm run lint`
Expected: build clean (no dangling `SellerComingSoon` import); full suite green; lint clean.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/router.tsx
git rm apps/admin/src/pages/SellerComingSoon.tsx 2>/dev/null || git add -A apps/admin/src/pages/SellerComingSoon.tsx
git commit -m "feat(admin): wire seller inventory routes; remove SellerComingSoon placeholder"
```

---

### Task 5: Sub-slice gate + runtime smoke + tracker (completes the seller portal)

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md`

- [ ] **Step 1: Full admin gate**

Run from `apps/admin`: `npm test`, `npm run lint`, `npm run build`. From repo root: `git status --porcelain` (clean), `git worktree list` (ignore the `improvment-UI` other-agent worktree).
Expected: all green.

- [ ] **Step 2: Runtime integration smoke**

Boot API (`:5000`) + admin (`:5002`); seed. As the seeded seller, exercise the real `/seller/inventory` endpoints the pages call:
- `GET /seller/inventory?pageSize=100` → 200 with the demo seller's 2 stock rows (one is `DEMO-002`, low-stock per the seed).
- `GET /seller/inventory/:productId` (a demo product id) → 200 with counters + movements.
- `POST /seller/inventory/:productId/movements` `{ type: 'ADDITION', quantity: 5, reason: 'smoke' }` → 204; re-GET shows available +5.
- (optional) `GET /seller/inventory?lowStock=true` → only the low-stock row.
Report statuses + the available delta. (Browser pixels = user click-through.)

- [ ] **Step 3: Update tracker — M2 seller portal complete**

In `docs/IMPLEMENTATION_PLAN.md`, append to the M2 row: "6d My Inventory (`/seller/inventory` stock list + detail/movements/adjust) done — **seller portal (6a–6d) complete**; remaining: 6e admin 'sold by'."

- [ ] **Step 4: Commit**

```bash
git add docs/IMPLEMENTATION_PLAN.md
git commit -m "docs(m2): mark slice 6d (seller My Inventory) done; seller portal complete"
```

- [ ] **Step 5: STOP and ask the user to verify (RULE.md §1)**

Summarize; suggest the user click-through (seller → My Inventory → open an item → post a movement → see updated counters + history). Note 6e (admin "sold by") is the final M2 slice. Do not push.

---

## Self-Review

**Spec coverage (against `2026-06-22-m2-slice6-admin-seller-portal-ui-design.md` §6d):**
- Seller stock list (available/reserved/low-stock) + low-stock filter + pagination → Task 2. ✓
- Per-product detail + movement history → Task 3. ✓
- Adjust form (post a movement) → Task 3 (reuses the admin page's ADJUSTMENT-vs-delta validation). ✓
- Hits `/seller/inventory` (scoped); cross-tenant 404 → not-found state → Task 3. ✓
- Replaces the last `SellerComingSoon` placeholder → Task 4 (+ deletes it). ✓
- Admin inventory pages unchanged → only new files + the seller router group + the placeholder deletion. ✓

**Placeholder scan:** No TBD/TODO. Tasks 2/3 use "copy the admin page, change ONLY X" with an exact change-list (the admin source is in the repo) — bounded, not vague. The new test assertions are enumerated (covered cases). The `SellerComingSoon` deletion is gated on a grep confirming no remaining references.

**Type consistency:** new client (Task 1) reuses `MovementView`/`ManualMovementType`/`CreateMovementInput` from `./inventory` (no movement-type duplication); `SellerStockItemView extends SellerStockRow` (6a) `{ movements }`. Pages (Tasks 2,3) consume `listSellerStock`/`getSellerStockItem`/`createSellerMovement` + `SellerStockRow`/`SellerStockItemView`. Routes (Task 4) reference the two page components. `createSellerMovement` returns `Promise<void>` (API 204), matching the admin `createMovement`.

**Reuse note:** `LowStockBadge`, `Pagination`, and the movement *types* are reused verbatim; the seller pages are parallel to the admin pages (path/title/client differences only) per the design's no-premature-abstraction stance. Deleting `SellerComingSoon` is the right cleanup now that both its routes host real pages — it removes dead code (coding-standards: remove dead code).

**Note on inherited parity debt:** the admin `InventoryItemPage` uses `key={i}` (array index) for the movement-history rows and has no double-submit guard beyond the `submitting` flag (it does disable the button via `submitting`). The seller copy inherits these as-is (parity); they're logged with the other 6b/6c inherited-parity items for the M2 final-review triage (fix-in-both-or-accept), not diverged here.
