# M4a — Reviews & Ratings — Slice S3 (Admin Moderation UI) — Design

> **Date:** 2026-07-07
> **Phase:** M4a S3 (of the M4 Reviews + Notifications group) — `docs/IMPLEMENTATION_PLAN.md`.
> **Branch:** `feat/reviews-admin` (off `main`; S1 API + S2 storefront already merged).
> **Status:** Approved design. One slice; stop-and-verify with a light/dark browser smoke (RULE.md §1, §10). Presentational-only.

## Context

M4a S1 (reviews API) and S2 (storefront reviews UI) are merged to `main`. S3 is the **last reviews slice**: the admin moderation queue that consumes the already-merged admin endpoints — no API/backend changes.

**API S3 consumes (from S1, `apps/api/src/reviews/admin-reviews.controller.ts`, ADMIN-only):**
- `GET /admin/reviews` — query `page?`, `pageSize?`, `productId?`, `isHidden?` (`"true"|"false"`). Returns `Paginated<AdminReviewView>`:
  - `Paginated<T> = { data: T[]; page: number; pageSize: number; total: number; totalPages: number }`
  - `AdminReviewView = { id, rating, title (string|null), body (string|null), isVerified, authorName, publishedAt (Date|null), productId, userId, isHidden, createdAt }`
- `PATCH /admin/reviews/:id/hide` → 204.
- `PATCH /admin/reviews/:id/unhide` → 204.

The admin app already has every primitive S3 needs: `Pagination`, `StatusBadge`, `RowActionsMenu`, `useConfirm` (accessible AlertDialog), `PageHeader`, `table`, and the `AdminOnlyRoute` gate. `lib/orders.ts` is the closest client analog (same `Paginated<T>` incl. `totalPages`); `SellersPage`/`ProductsPage` are the closest page analogs (list + row status-actions via `useConfirm`; cancellation-guarded fetch keyed on `[page, …, refreshTick]`).

## Decisions (approved)

1. **List-only with inline actions.** A single `/reviews` page — paginated table + Hide/Unhide row action. No detail page (reviews are short; a detail view adds a click for no payoff). Mirrors `SellersPage`.
2. **Visibility filter only.** A segmented **All / Visible / Hidden** control → `isHidden` absent / `'false'` / `'true'`. No `productId` filter (a raw-ID box is low-value UX; a real product-picker is out of scope).
3. **Presentational-only.** No API/backend/schema changes; consume the merged endpoints as-is.
4. **`productId` shown, not product name (known limitation).** The admin API row carries `productId` but not the product name/slug. The table shows the `productId` (truncated, monospace). Enriching to a product name would require an S1 API addition — out of scope for S3; recorded as a follow-up.

## Architecture / boundaries

Two new files + two wiring edits, following the admin conventions exactly:

```
apps/admin/src/
  lib/reviews.ts               CREATE  client: types + listAdminReviews + hideReview + unhideReview
  lib/reviews.test.ts          CREATE
  pages/ReviewsPage.tsx        CREATE  moderation table + visibility filter + pagination + actions
  pages/ReviewsPage.test.tsx   CREATE
  router.tsx                   MODIFY  add { path: 'reviews', element: <ReviewsPage /> } under AdminOnlyRoute
  components/AppShell.tsx       MODIFY  add ADMIN-only "Reviews" <NavItem> in the "Operations" group (with Orders + Sellers)
```

**Units:**
- **`lib/reviews.ts`** — owns the API contract mirror. Exports:
  - `AdminReview` (mirrors `AdminReviewView`; `publishedAt`/`createdAt` typed as `string` — JSON serializes Dates to ISO strings, matching how `orders.ts` types `createdAt: string`).
  - `Paginated<T>` (reuse the same shape as `orders.ts`: `{data,page,pageSize,total,totalPages}`).
  - `ReviewVisibility = 'all' | 'visible' | 'hidden'` + `ListAdminReviewsQuery = { page?; pageSize?; isHidden?: 'true'|'false' }`.
  - `listAdminReviews(query): Promise<Paginated<AdminReview>>` — GET with a defined-params-only query string (reuse the `toQuery` helper pattern from `orders.ts`).
  - `hideReview(id): Promise<void>` / `unhideReview(id): Promise<void>` — PATCH, no body.
- **`pages/ReviewsPage.tsx`** — owns fetch/pagination/filter/action state; renders the table; no data logic beyond calling the client.

Cross-file: the page depends only on `lib/reviews.ts` + shared UI primitives. The client depends only on `apiClient`. Clean, testable in isolation.

## Behavior / data flow

- **Visibility filter:** segmented control All / Visible / Hidden. `all → isHidden` omitted; `visible → 'false'`; `hidden → 'true'`. Changing the filter **resets to page 1**.
- **Fetch:** one cancellation-guarded `useEffect` keyed on `[page, visibility, refreshTick]` (the `ProductsPage` pattern — avoids the duplicate-fetch bug). Stores `data`, `total`, `totalPages`, `loading`, `error`.
- **Row columns:** `productId` (truncated + monospace), author name, rating (`★ {rating}/5`), title (bold) + body excerpt (line-clamped, `null` → em dash), `VERIFIED` badge when `isVerified`, a visibility `StatusBadge` (Hidden vs Visible), created date (locale-formatted).
- **Row action:** `RowActionsMenu` → "Hide" when currently visible, "Unhide" when hidden. Each wrapped in `useConfirm` (accessible AlertDialog with a clear title/description). On confirm → `hideReview`/`unhideReview(id)` → `setRefreshTick(t => t+1)` to refetch (preserves "action → reload", matching `ProductsPage`). Guard against double-submit while the action is in flight.
- **Pagination:** `<Pagination page total totalPages onPageChange={setPage} />` (state-driven, the admin component contract; `totalPages` comes straight from the API — do not recompute).
- **Empty state:** "No reviews found." when `data` is empty and no error.
- **Error state:** error banner with a "Try again" button (`refreshTick++`); the empty state is suppressed while an error shows (matches `ProductsPage` B4).
- **Step-back-on-empty:** if `page > 1 && data.length === 0` after a fetch (e.g. hid the last row on the last page), `setPage(page - 1)` (guarded to avoid loops), matching `ProductsPage`.

## Error handling

- Client mutations/list reject on non-2xx via `apiClient` (existing convention); the page catches and sets `error`.
- Hide/unhide are **idempotent server-side** (S1), so a double-confirm or stale action is safe.
- No optimistic update — refetch after the mutation resolves keeps the row's `isHidden`/badge authoritative from the server.

## Testing / verification

- **Vitest + RTL** (mirror `SellersPage.test.tsx` / `ProductsPage.test.tsx`):
  - `lib/reviews.test.ts`: `listAdminReviews` builds the right query string (incl. `isHidden` present/absent + pagination); `hideReview`/`unhideReview` PATCH the right path; `Paginated` shape passes through.
  - `ReviewsPage.test.tsx`: renders rows from a mocked client; visibility switch sets `isHidden` and resets to page 1; pagination click refetches with the new page; Hide action → confirm → calls `hideReview` → refetches; Unhide symmetric; empty state; error banner + Try-again; step-back-on-empty.
- **`tsc -b` + `vite build`** clean.
- **Browser smoke light + dark** (RULE.md §10) vs `ecom_dev` + running admin: list renders; All/Visible/Hidden filter works; hide a review (confirm dialog) → flips to Hidden + drops from the Visible filter; unhide restores; pagination if >1 page; both themes legible (filled buttons/badges use brand color + literal white per the theme-safe-buttons rule, or existing primitives).

## Out of scope (YAGNI)

- **Product name/slug in the row** — needs an S1 API addition; show `productId` for now (follow-up).
- **`productId` filter / product-picker** — visibility filter only.
- **Review detail page** — list-only.
- **Bulk moderation, sorting, search** — not in M4a scope.
- **Editing review content** — moderators hide/unhide only.

## Risks

- **Theme wash-out** — reuse existing admin primitives (`StatusBadge`, `button`); any filled action button uses `bg-primary-600 text-white`, never `bg-content`/`text-surface` (repo rule). Verified by the dual-theme smoke.
- **Duplicate-fetch regression** — avoided by the single `[page, visibility, refreshTick]` effect (not a separate mount effect), per the `ProductsPage` B2 lesson.
- **`totalPages` mismatch** — consume the API's `totalPages` directly (S1 whole-branch review added it specifically so admin lists don't recompute).
- **PII** — the API already projects author `name` only (no email); the UI renders `authorName` as-is. Nothing sensitive to leak client-side.
