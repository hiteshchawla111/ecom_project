# M4a — Reviews Admin Moderation UI (S3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the admin reviews moderation queue — a paginated `/reviews` page (ADMIN-only) with an All/Visible/Hidden filter and inline Hide/Unhide actions — on branch `feat/reviews-admin`.

**Architecture:** A `lib/reviews.ts` client mirroring the merged S1 admin API (`GET /admin/reviews`, `PATCH /admin/reviews/:id/hide|unhide`), and a `ReviewsPage` that reuses the admin app's established list-page idiom (cancellation-guarded fetch keyed on `[page, visibility, refreshTick]`, `Pagination`, `RowActionsMenu` + `useConfirm`, error/empty/loading states). Presentational-only — no API/backend changes. Wire the route under `AdminOnlyRoute` and a nav link into `AppShell`.

**Tech Stack:** React 19 + Vite + TypeScript (strict), React Router, Vitest + React Testing Library, Tailwind v4 design tokens, shadcn/Radix primitives (`RowActionsMenu`, `useConfirm`).

## Global Constraints

- **Branch:** `feat/reviews-admin` (already created off `main`; spec committed at `2489c11`). Merge into `main` when done (do NOT push a branch and ask; the user merges locally per this session's correction) — but STOP for the user's light/dark verification first (RULE.md §1, §10).
- **Presentational-only:** no changes to `apps/api` or any backend/schema. Consume the merged endpoints as-is.
- **Strict TS, no `any`.** Match existing admin patterns exactly; don't refactor unrelated code.
- **API contract (from S1, verbatim):** `GET /admin/reviews?page&pageSize&productId&isHidden` → `{ data: AdminReviewView[], page, pageSize, total, totalPages }`. `AdminReviewView = { id, rating (1..5 int), title (string|null), body (string|null), isVerified (bool), authorName (string), publishedAt (string|null ISO), productId, userId, isHidden (bool), createdAt (string ISO) }`. `PATCH /admin/reviews/:id/hide` and `/unhide` → **204** (no body). Hide/unhide are idempotent server-side.
- **`isHidden` query value is the string `"true"`/`"false"`** (or omitted for All).
- **Consume `totalPages` from the API — never recompute it.**
- **Theme-safe:** reuse existing primitives; any filled button uses `bg-primary-600 text-white`, never `bg-content`/`text-surface` (repo rule). Verify in BOTH themes.
- **Run commands from `apps/admin`** with absolute paths (cwd resets). Test: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/admin && npx vitest run <file>`. Build: `npm run build` (runs `tsc -b` + `vite build`).
- **PII:** the API returns author `name` only (no email); render `authorName` as-is — never assume more fields exist.

---

## File structure

```
apps/admin/src/
  lib/reviews.ts                          CREATE  types + listAdminReviews + hideReview + unhideReview
  lib/reviews.test.ts                     CREATE
  components/reviews/ReviewStatusBadge.tsx CREATE  Hidden/Visible badge (mirrors products/StatusBadge)
  components/reviews/ReviewStatusBadge.test.tsx CREATE
  pages/ReviewsPage.tsx                   CREATE  moderation table + visibility filter + pagination + hide/unhide
  pages/ReviewsPage.test.tsx              CREATE
  router.tsx                              MODIFY  add { path: 'reviews', element: <ReviewsPage /> } under AdminOnlyRoute
  components/AppShell.tsx                  MODIFY  add ADMIN-only "Reviews" NavItem in the Operations group
```

**Task order (each ends at an independently testable + committable deliverable):**
1. `lib/reviews.ts` client + tests.
2. `ReviewStatusBadge` component + tests.
3. `ReviewsPage` + tests (the bulk: table, filter, pagination, hide/unhide).
4. Router + AppShell wiring (+ build).
5. Light/dark browser smoke + final gate → STOP for user verification.

---

### Task 1: `lib/reviews.ts` client

**Files:**
- Create: `apps/admin/src/lib/reviews.ts`
- Test: `apps/admin/src/lib/reviews.test.ts`

**Interfaces:**
- Consumes: `apiClient.request<T>(path, init?)` from `./apiClient`.
- Produces:
  - `AdminReview = { id: string; rating: number; title: string | null; body: string | null; isVerified: boolean; authorName: string; publishedAt: string | null; productId: string; userId: string; isHidden: boolean; createdAt: string }`
  - `Paginated<T> = { data: T[]; page: number; pageSize: number; total: number; totalPages: number }`
  - `ReviewVisibility = 'all' | 'visible' | 'hidden'`
  - `ListAdminReviewsQuery = { page?: number; pageSize?: number; isHidden?: 'true' | 'false' }`
  - `listAdminReviews(query?: ListAdminReviewsQuery): Promise<Paginated<AdminReview>>`
  - `hideReview(id: string): Promise<void>`
  - `unhideReview(id: string): Promise<void>`

- [ ] **Step 1: Write the failing test** `apps/admin/src/lib/reviews.test.ts`. Mirror `apps/admin/src/lib/orders.test.ts` for how `apiClient` is mocked (open it first to match the exact mocking style — likely `vi.mock('./apiClient', …)`).

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./apiClient', () => ({
  apiClient: { request: vi.fn() },
}));

import { apiClient } from './apiClient';
import { listAdminReviews, hideReview, unhideReview } from './reviews';

const req = apiClient.request as unknown as ReturnType<typeof vi.fn>;

describe('reviews client', () => {
  beforeEach(() => req.mockReset());

  it('listAdminReviews builds a query string with only defined params', async () => {
    req.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
    await listAdminReviews({ page: 2, pageSize: 20, isHidden: 'true' });
    expect(req).toHaveBeenCalledWith('/admin/reviews?page=2&pageSize=20&isHidden=true');
  });

  it('listAdminReviews omits undefined params (All visibility)', async () => {
    req.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
    await listAdminReviews({ page: 1 });
    expect(req).toHaveBeenCalledWith('/admin/reviews?page=1');
  });

  it('hideReview PATCHes the hide route', async () => {
    req.mockResolvedValue(undefined);
    await hideReview('r1');
    expect(req).toHaveBeenCalledWith('/admin/reviews/r1/hide', { method: 'PATCH' });
  });

  it('unhideReview PATCHes the unhide route', async () => {
    req.mockResolvedValue(undefined);
    await unhideReview('r1');
    expect(req).toHaveBeenCalledWith('/admin/reviews/r1/unhide', { method: 'PATCH' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/admin && npx vitest run src/lib/reviews.test.ts`
Expected: FAIL — cannot resolve `./reviews`.

- [ ] **Step 3: Implement `apps/admin/src/lib/reviews.ts`** (mirror `orders.ts`'s `toQuery` + `apiClient.request` conventions):

```ts
import { apiClient } from './apiClient';

/** A row in the admin reviews moderation list (mirrors API AdminReviewView). */
export interface AdminReview {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  isVerified: boolean;
  authorName: string;
  publishedAt: string | null;
  productId: string;
  userId: string;
  isHidden: boolean;
  createdAt: string;
}

/** Paginated envelope mirroring the API list response. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** UI-facing visibility filter → API `isHidden` param. */
export type ReviewVisibility = 'all' | 'visible' | 'hidden';

export interface ListAdminReviewsQuery {
  page?: number;
  pageSize?: number;
  isHidden?: 'true' | 'false';
}

/** Build a query string from defined params only. */
function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** List reviews for moderation (ADMIN). */
export function listAdminReviews(
  query: ListAdminReviewsQuery = {},
): Promise<Paginated<AdminReview>> {
  const path = `/admin/reviews${toQuery({
    page: query.page,
    pageSize: query.pageSize,
    isHidden: query.isHidden,
  })}`;
  return apiClient.request<Paginated<AdminReview>>(path);
}

/** Soft-hide a review (ADMIN). 204, no body. */
export function hideReview(id: string): Promise<void> {
  return apiClient.request<void>(`/admin/reviews/${id}/hide`, { method: 'PATCH' });
}

/** Restore a hidden review (ADMIN). 204, no body. */
export function unhideReview(id: string): Promise<void> {
  return apiClient.request<void>(`/admin/reviews/${id}/unhide`, { method: 'PATCH' });
}
```

> Verify `apiClient.request`'s signature in `apps/admin/src/lib/apiClient.ts` accepts `(path, init?)` where `init.method` drives the verb (it does — `orders.ts` `updateOrderStatus` uses `{ method: 'PATCH', body: … }`). No body is needed for hide/unhide.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/admin && npx vitest run src/lib/reviews.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/admin/src/lib/reviews.ts apps/admin/src/lib/reviews.test.ts
git commit -m "feat(admin-reviews): API client for admin reviews moderation"
```

---

### Task 2: `ReviewStatusBadge` component

**Files:**
- Create: `apps/admin/src/components/reviews/ReviewStatusBadge.tsx`
- Test: `apps/admin/src/components/reviews/ReviewStatusBadge.test.tsx`

**Interfaces:**
- Produces: `ReviewStatusBadge({ isHidden: boolean })` — renders "Hidden" (muted/neutral) or "Visible" (success tint), mirroring `components/products/StatusBadge.tsx` styling conventions (semantic tint + matching text, uppercase letterspaced, never color-only).

- [ ] **Step 1: Write the failing test** `ReviewStatusBadge.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviewStatusBadge } from './ReviewStatusBadge';

describe('ReviewStatusBadge', () => {
  it('shows Visible when not hidden', () => {
    render(<ReviewStatusBadge isHidden={false} />);
    expect(screen.getByText('Visible')).toBeInTheDocument();
  });

  it('shows Hidden when hidden', () => {
    render(<ReviewStatusBadge isHidden />);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/admin && npx vitest run src/components/reviews/ReviewStatusBadge.test.tsx`
Expected: FAIL — cannot resolve `./ReviewStatusBadge`.

- [ ] **Step 3: Implement `ReviewStatusBadge.tsx`** (mirror `products/StatusBadge.tsx` class idiom):

```tsx
/** Visibility badge for a review — semantic tint + matching text (never color-only). */
export function ReviewStatusBadge({ isHidden }: { isHidden: boolean }) {
  const style = isHidden
    ? 'bg-line text-content-muted'
    : 'bg-success-500/10 text-success-500';
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.1em] ${style}`}
    >
      {isHidden ? 'Hidden' : 'Visible'}
    </span>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/admin && npx vitest run src/components/reviews/ReviewStatusBadge.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/admin/src/components/reviews/ReviewStatusBadge.tsx apps/admin/src/components/reviews/ReviewStatusBadge.test.tsx
git commit -m "feat(admin-reviews): ReviewStatusBadge (Hidden/Visible)"
```

---

### Task 3: `ReviewsPage` — table, visibility filter, pagination, hide/unhide

**Files:**
- Create: `apps/admin/src/pages/ReviewsPage.tsx`
- Test: `apps/admin/src/pages/ReviewsPage.test.tsx`

**Interfaces:**
- Consumes: `listAdminReviews`, `hideReview`, `unhideReview`, `AdminReview`, `ReviewVisibility` from `../lib/reviews`; `Pagination` from `../components/ui/Pagination`; `RowActionsMenu` from `../components/ui/RowActionsMenu`; `useConfirm` from `../components/ui/confirm`; `ReviewStatusBadge` from `../components/reviews/ReviewStatusBadge`.
- Produces: `export function ReviewsPage()` (default export not required; router imports the named export).

**Behavior contract (mirror `SellersPage.tsx` / `ProductsPage.tsx`):**
- State: `reviews: AdminReview[]`, `page`, `total`, `totalPages`, `loading`, `error`, `visibility: ReviewVisibility` (default `'all'`), `refreshTick`, `busyId: string | null` (in-flight action guard).
- One `useEffect` keyed on `[page, visibility, refreshTick]`, cancellation-guarded, calls `listAdminReviews({ page, pageSize: 20, isHidden: visibility==='all' ? undefined : visibility==='hidden' ? 'true' : 'false' })`.
- Changing visibility resets to page 1.
- Step-back-on-empty: after load, `if (page > 1 && data.length === 0) setPage(page-1)`.
- Row action via `RowActionsMenu` (children are `<button>` items): "Hide" when `!isHidden`, "Unhide" when `isHidden`; on click → `confirm({title, description})`; if confirmed, set `busyId`, call `hideReview`/`unhideReview(id)`, then `setRefreshTick(t=>t+1)`; on error set `error`; always clear `busyId`.
- Error banner with a "Try again" (`reload`), empty state ("No reviews found."), loading state — copy the exact markup idiom from `SellersPage.tsx`.
- `Pagination` gets `page`, `totalPages`, `pageSize={20}`, `onPageChange={setPage}`.

- [ ] **Step 1: Write the failing test** `ReviewsPage.test.tsx`. Mirror `SellersPage.test.tsx` for the render harness — it must wrap in `ConfirmProvider` (so `useConfirm` works) and a router if the component uses any router hooks (SellersPage doesn't navigate on actions, so a plain render inside `ConfirmProvider` should suffice; check `SellersPage.test.tsx` and match). Mock `../lib/reviews`.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmProvider } from '../components/ui/confirm';

vi.mock('../lib/reviews', () => ({
  listAdminReviews: vi.fn(),
  hideReview: vi.fn(),
  unhideReview: vi.fn(),
}));

import { listAdminReviews, hideReview, unhideReview } from '../lib/reviews';
import { ReviewsPage } from './ReviewsPage';

const list = listAdminReviews as unknown as ReturnType<typeof vi.fn>;
const hide = hideReview as unknown as ReturnType<typeof vi.fn>;
const unhide = unhideReview as unknown as ReturnType<typeof vi.fn>;

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'r1', rating: 5, title: 'Great', body: 'Loved it',
    isVerified: true, authorName: 'Ann', publishedAt: '2026-07-01T00:00:00.000Z',
    productId: 'p-abc', userId: 'u1', isHidden: false, createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}
function page(data: unknown[], over: Partial<Record<string, number>> = {}) {
  return { data, page: 1, pageSize: 20, total: data.length, totalPages: 1, ...over };
}

function renderPage() {
  return render(
    <ConfirmProvider>
      <ReviewsPage />
    </ConfirmProvider>,
  );
}

describe('ReviewsPage', () => {
  beforeEach(() => {
    list.mockReset(); hide.mockReset(); unhide.mockReset();
    list.mockResolvedValue(page([row()]));
  });

  it('renders review rows from the API', async () => {
    renderPage();
    expect(await screen.findByText('Great')).toBeInTheDocument();
    expect(screen.getByText('Ann')).toBeInTheDocument();
    expect(screen.getByText('Visible')).toBeInTheDocument();
  });

  it('switching visibility to Hidden refetches with isHidden=true and resets to page 1', async () => {
    renderPage();
    await screen.findByText('Great');
    await userEvent.click(screen.getByRole('button', { name: /hidden/i }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, isHidden: 'true' }),
      ),
    );
  });

  it('Hide action confirms then calls hideReview and refetches', async () => {
    hide.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText('Great');
    await userEvent.click(screen.getByRole('button', { name: /actions|open menu|⋯/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /hide/i }));
    // ConfirmProvider AlertDialog → confirm
    await userEvent.click(await screen.findByRole('button', { name: /confirm|hide|yes/i }));
    await waitFor(() => expect(hide).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2)); // initial + after action
  });

  it('shows an error banner with Try again on load failure', async () => {
    list.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('shows the empty state when there are no reviews', async () => {
    list.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText(/no reviews/i)).toBeInTheDocument();
  });
});
```

> The exact accessible names for the `RowActionsMenu` trigger and the `useConfirm` dialog buttons depend on those components' implementations — open `components/ui/RowActionsMenu.tsx` (trigger `aria-label` prop) and `components/ui/confirm.tsx` (the AlertDialog action/cancel button labels; check whether `ConfirmOptions` has a `confirmLabel`) and adjust the `getByRole`/`findByRole` name matchers to the real labels before finalizing. Keep the assertions (calls `hide('r1')`, refetches, resets page) intact.

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/admin && npx vitest run src/pages/ReviewsPage.test.tsx`
Expected: FAIL — cannot resolve `./ReviewsPage`.

- [ ] **Step 3: Implement `ReviewsPage.tsx`.** Copy the structural idiom from `apps/admin/src/pages/SellersPage.tsx` (header + filter `<select>` or segmented buttons; error banner; loading/empty; table; `Pagination`). Use a visibility control (a `<select>` with All/Visible/Hidden is simplest and matches `SellersPage`'s status select; or three segmented buttons — either is fine, keep it accessible with a label). Key logic:

```tsx
import { useCallback, useEffect, useState } from 'react';
import {
  listAdminReviews,
  hideReview,
  unhideReview,
  type AdminReview,
  type ReviewVisibility,
} from '../lib/reviews';
import { Pagination } from '../components/ui/Pagination';
import { RowActionsMenu } from '../components/ui/RowActionsMenu';
import { useConfirm } from '../components/ui/confirm';
import { ReviewStatusBadge } from '../components/reviews/ReviewStatusBadge';

const PAGE_SIZE = 20;

const VISIBILITY_TO_PARAM: Record<ReviewVisibility, 'true' | 'false' | undefined> = {
  all: undefined,
  visible: 'false',
  hidden: 'true',
};

export function ReviewsPage() {
  const confirm = useConfirm();
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [visibility, setVisibility] = useState<ReviewVisibility>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => setRefreshTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await listAdminReviews({
          page,
          pageSize: PAGE_SIZE,
          isHidden: VISIBILITY_TO_PARAM[visibility],
        });
        if (cancelled) return;
        // Step back if we ran off the end (e.g. hid the last row on the last page).
        if (page > 1 && res.data.length === 0) {
          setPage((p) => p - 1);
          return;
        }
        setReviews(res.data);
        setTotalPages(res.totalPages);
        setError(null);
      } catch {
        if (!cancelled) setError('Could not load reviews. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, visibility, refreshTick]);

  function onVisibilityChange(next: ReviewVisibility) {
    setPage(1);
    setVisibility(next);
  }

  async function onToggleHidden(r: AdminReview) {
    const hiding = !r.isHidden;
    const ok = await confirm({
      title: hiding ? 'Hide this review?' : 'Restore this review?',
      description: hiding
        ? 'It will no longer be visible on the storefront and will be excluded from the product rating.'
        : 'It will become visible again and count toward the product rating.',
    });
    if (!ok) return;
    setBusyId(r.id);
    try {
      await (hiding ? hideReview(r.id) : unhideReview(r.id));
      reload();
    } catch {
      setError('Could not update the review. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  // …render: header + visibility control; error banner (reload); loading/empty;
  //   table rows (productId monospace-truncated, authorName, `★ {rating}/5`,
  //   title bold + body line-clamped, VERIFIED when isVerified, <ReviewStatusBadge/>,
  //   createdAt via new Date(r.createdAt).toLocaleDateString(); RowActionsMenu with a
  //   single Hide/Unhide <button> disabled while busyId===r.id);
  //   <Pagination page={page} totalPages={totalPages} pageSize={PAGE_SIZE} onPageChange={setPage} />
}
```

Fill the render body by adapting `SellersPage.tsx`'s JSX (header, error banner, loading/empty guards, `<table>` from `components/ui/table` if SellersPage uses it, otherwise plain table matching SellersPage). The visibility control: a labelled `<select>` with options All / Visible / Hidden calling `onVisibilityChange(e.target.value as ReviewVisibility)`. Each row's `RowActionsMenu` contains one `<button type="button" disabled={busyId===r.id} onClick={() => onToggleHidden(r)}>{r.isHidden ? 'Unhide' : 'Hide'}</button>`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/admin && npx vitest run src/pages/ReviewsPage.test.tsx`
Expected: PASS (5 tests). If the `RowActionsMenu`/confirm role-name matchers don't resolve, fix the test's name matchers to the real accessible labels (from the primitives' source) — do NOT weaken the behavioral assertions.

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/admin/src/pages/ReviewsPage.tsx apps/admin/src/pages/ReviewsPage.test.tsx
git commit -m "feat(admin-reviews): ReviewsPage — moderation table, visibility filter, hide/unhide"
```

---

### Task 4: Wire the route + nav link (+ build)

**Files:**
- Modify: `apps/admin/src/router.tsx`
- Modify: `apps/admin/src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `ReviewsPage` from `./pages/ReviewsPage`.
- Produces: the `/reviews` route (ADMIN-only) + an ADMIN-only "Reviews" nav link.

- [ ] **Step 1: Add the route.** In `apps/admin/src/router.tsx`, import `ReviewsPage` at the top (next to the other page imports) and add this line inside the `AdminOnlyRoute` `children` array (right after the `orders`/`sellers` entries):

```tsx
{ path: 'reviews', element: <ReviewsPage /> },
```

- [ ] **Step 2: Add the nav link.** In `apps/admin/src/components/AppShell.tsx`, inside the ADMIN-only "Operations" group (where the `Orders` and `Sellers` `<NavItem>`s live), add:

```tsx
<NavItem to="/reviews" icon="reviews">
  Reviews
</NavItem>
```

Check the `NavItem` `icon` prop's allowed values / icon map in `AppShell.tsx`. If there is no `reviews` icon, use an existing sensible one already in the map (e.g. the same icon `orders` or `sellers` uses, or whatever generic icon exists) — do NOT invent an icon key that the icon renderer doesn't handle. Report which icon you used.

- [ ] **Step 3: Update the AppShell test if it locks the admin nav set.** `apps/admin/src/components/AppShell.test.tsx` may assert the exact list of visible admin links. If it does, add "Reviews" to that expectation. Run it:

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/admin && npx vitest run src/components/AppShell.test.tsx src/components/AppShell.inventory.test.tsx src/components/AppShell.seller.test.tsx`
Expected: PASS (update the admin-nav assertion if one exists; the `inventory`/`seller` role-gate tests must still confirm non-admins do NOT see Reviews — if those tests enumerate links, ensure Reviews is admin-only).

- [ ] **Step 4: Full admin suite + build**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/admin && npx vitest run && npm run build`
Expected: whole admin suite green; `tsc -b` + `vite build` clean (no new errors).

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/admin/src/router.tsx apps/admin/src/components/AppShell.tsx apps/admin/src/components/AppShell.test.tsx
git commit -m "feat(admin-reviews): route + ADMIN-only nav link for the moderation queue"
```

---

### Task 5: Light/dark browser smoke + final gate

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Ensure the API is running** against `ecom_dev` (fresh, per the stale-`:5000` memory) so the admin app has data. From `apps/api`: `npm run start:dev` (background); confirm `/admin/reviews` is in the route map. There should be seeded reviews from the S1/S2 smokes, or create one via the storefront/S1 flow if the table is empty.

- [ ] **Step 2: Run the admin app** (`apps/admin`, `npm run dev` → `:5002`), log in as an ADMIN (e.g. `admin@example.com`), navigate to **Reviews**.

- [ ] **Step 3: Smoke — both themes (RULE.md §10).** For **light AND dark** (toggle theme, screenshot each):
  - List renders rows (productId, author, rating, title/body, VERIFIED, Visible/Hidden badge, date).
  - Visibility filter: All → Visible → Hidden re-queries and the row set changes; switching resets to page 1.
  - Hide a Visible review → confirm dialog appears (accessible), confirm → row flips to Hidden and drops out of the Visible filter; product's rating on the storefront/`GET /products/:id` reflects the drop.
  - Unhide it → restored.
  - Confirm the dialog + any filled buttons are legible in dark mode (no cream-on-cream).

- [ ] **Step 4: Final gate** — from `apps/admin`: `npx vitest run && npm run build` both clean. Stop the dev servers.

- [ ] **Step 5: STOP and report** (RULE.md §1) — do NOT merge yet. Summary of changes, files, both-theme screenshots described, the known `productId`-not-name limitation, and the RULE.md §6 resume prompt. Await user verification, then merge `feat/reviews-admin` into `main` (fast-forward if possible), and flip M4a S3 to ✅ in `docs/IMPLEMENTATION_PLAN.md`.

---

## Verification (whole slice)

- `npx vitest run` (whole admin suite) green, including the new `reviews` client (4), `ReviewStatusBadge` (2), and `ReviewsPage` (5) tests, and the updated `AppShell` nav assertion.
- `npm run build` (`tsc -b` + `vite build`) clean — no `any`, no new type errors.
- Browser smoke in BOTH themes: list + visibility filter + hide/unhide (with confirm dialog) work against `ecom_dev`; badges/dialog legible in dark.
- No backend/API changes in the diff (presentational-only).
- Known limitation recorded: row shows `productId`, not product name (would need an S1 API addition — deferred).
```
