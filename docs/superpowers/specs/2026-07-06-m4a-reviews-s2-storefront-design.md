# M4a S2 — Storefront Reviews UI — Design

> **Date:** 2026-07-06
> **Phase:** M4a S2 (of the M4 Reviews + Notifications group) — `docs/IMPLEMENTATION_PLAN.md`.
> **Branch:** `feat/reviews-storefront` (off `main`, **after S1 is merged**).
> **Depends on:** M4a S1 (reviews API) — see `docs/superpowers/specs/2026-07-01-m4a-reviews-design.md` and `…/plans/2026-07-01-m4a-reviews-s1-api.md`.
> **Status:** Approved design. Implement one slice, stop-and-verify (RULE.md §1); TDD (RULE.md §4); smoke-run the real thing in light + dark (RULE.md §5 + §10).

## Context

S1 shipped the reviews **API** (verified-purchase gate, in-tx rating aggregate, public cursor list + summary/distribution, admin moderation). The rating **display shell** already exists from M3a (`RatingStars`, `Product.ratingAvg/ratingCount`). S2 adds the **storefront reviews UI** that consumes the S1 public API: a reviews section on the product detail page with a server-rendered summary + distribution + first-page list, client "Load more" pagination, and a customer review form.

S2 is **presentational / consumption only** — it makes **no API changes** and adds no backend endpoints. It ships purely on the merged S1 surface.

### The eligibility decision (why there's no "can I review?" call)

The S1 API exposes only:

- `GET /products/:id/reviews` — public list + `summary` (`ratingAvg`, `ratingCount`, `distribution`), cursor-paginated (`?cursor=&limit=`, default 10 / max 50).
- `POST /products/:id/reviews` — authed customer create; **403** if no `DELIVERED` order containing the product, **409** if already reviewed (`@@unique`), **400** on invalid `rating`/over-length fields.

There is **no eligibility endpoint**. Approved approach: **error-driven** — the storefront does not pre-check eligibility. It shows a review form to any authenticated customer and maps the `POST`'s `403/409/400` responses to friendly inline messages on submit. This keeps S2 storefront-only (no re-touch of the API branch); the only cost is that a user learns "already reviewed" / "not a purchaser" on submit rather than before. Guests never see the form (they get a sign-in link), so they never fill it out and get bounced.

## Decisions (approved)

1. **Error-driven eligibility, no new API.** Show the form to logged-in customers; map `POST` `403 → "you can review once you've received it"`, `409 → "you've already reviewed this"`, `400 → field error`, `401 → redirect to /login`. No backend change.
2. **Form visibility: logged-in customers only; errors inline.** Guests see a "Sign in to write a review" link (to `/login`) instead of the form. The current user is read **server-side** (`getCurrentUser()`) and passed into the form island as a prop — no client-side user fetch (avoids the render-cookie trap).
3. **List loading: SSR first page + "Load more".** The product page server-renders the summary + distribution + the first page of reviews (SEO-visible). A client "Load more" button fetches the next cursor page through the same-origin proxy and appends. Best balance of SEO, first paint, and pagination.
4. **Composition: server section shell + two focused client islands** (approved Approach A). Maximizes SSR content; keeps interactivity in two small, independently-testable islands; matches the storefront's "SSR content, island interactivity" convention.

## Architecture / component tree

A new full-width reviews section on `/products/[id]`, slotted **between** the two-column product grid (`page.tsx:162`) and `<RelatedProducts>` (`page.tsx:164`), anchored `#reviews` so the existing `RatingStars` cluster (`page.tsx:82`) can link to it.

```
app/products/[id]/page.tsx  (Server Component — exists)
  └─ <ProductReviews productId={id} />              ← NEW server component
        │  server-side: getReviewsFor(id) + getCurrentUser()
        │  renders SSR: <section id="reviews">, heading, summary header,
        │               <RatingBreakdown/>, empty-state, mounts the two islands
        ├─ <RatingBreakdown distribution count />    ← NEW server, presentational
        ├─ <ReviewList productId initial={firstPage} />   ← NEW client island
        │        state: reviews, nextCursor, loading, error
        │        "Load more" → GET /api/products/:id/reviews?cursor=&limit= (proxy)
        └─ <ReviewForm productId canAttempt={!!user} />   ← NEW client island
                 !canAttempt → "Sign in to write a review" → /login
                 canAttempt  → form → POST /api/products/:id/reviews (proxy)
```

### New files

| File | Kind | Purpose |
|---|---|---|
| `src/lib/reviews.ts` | `server-only` read client | `Review`, `ReviewSummary`, `ReviewPage` types + `listReviews(productId, {cursor?, limit?}, opts)` + `getReviewsFor(productId)` wrapper binding `apiBaseUrl()`. Mirrors `catalog.ts` (injectable `fetch`, typed error, `no-store`). |
| `src/lib/api-reviews.ts` | `server-only` authed write client | `createReview(productId, input, deps)` over `authedRequest`. Mirrors `api-orders.ts`. |
| `src/app/api/products/[id]/reviews/route.ts` | Next route handler | `POST` (authed create) + `GET` (public list passthrough for "Load more"). |
| `src/app/api/products/[id]/reviews/handlers.ts` | pure handlers | `handleCreateReview(input, deps)` + `handleListReviews(query, deps)` → `{status, body}`; maps `ApiAuthError`. Defines injectable `ReviewsRouteDeps`. |
| `src/app/api/products/[id]/reviews/route-deps.ts` | `server-only` | `liveReviewsRouteDeps()` wires create → `api-reviews` + `liveAuthedDeps()`; list → `reviews.ts` public read. |
| `src/app/api/products/[id]/reviews/handlers.test.ts` | test | `vi.fn()` deps factory. |
| `src/components/reviews/ProductReviews.tsx` | server component | section shell + summary + empty state; fetches list + user. |
| `src/components/reviews/RatingBreakdown.tsx` | server, presentational | 5→1 star distribution bars + counts. |
| `src/components/reviews/ReviewList.tsx` | client island | initial SSR page + "Load more" append. |
| `src/components/reviews/ReviewForm.tsx` | client island | gated form / sign-in link; error-driven submit. |
| `src/components/reviews/*.test.tsx` | tests | one per component. |

**Modified:** `src/app/products/[id]/page.tsx` — import + render `<ProductReviews productId={id} />` between the grid and `<RelatedProducts>`.

## Data flow

**Read (public, SSR).** `page.tsx` → `ProductReviews` → `getReviewsFor(id)` (server-bound, `apiBaseUrl()`) → `GET /products/:id/reviews` → `{ data, nextCursor, summary }`, rendered server-side into HTML. `ProductReviews` also calls `getCurrentUser()` → `CurrentUser | null`, passed to `<ReviewForm canAttempt={!!user}>`.

**"Load more" (public, client).** `<ReviewList>` holds the SSR first page + initial `nextCursor` as state. Click → `fetch('/api/products/:id/reviews?cursor=<c>&limit=10')` (same-origin GET proxy) → append `data`, update `nextCursor`; button hidden when `nextCursor === null`. Failure → inline "Couldn't load more reviews" + retry; never breaks the page (degrade-safe, like `suggest`).

**Write (authed, client).** `<ReviewForm>` (logged-in) → `fetch('/api/products/:id/reviews', {POST, json:{rating,title,body}})` → `route.ts` → `handleCreateReview(input, liveReviewsRouteDeps())` → `createReview` over `authedRequest` (forwards httpOnly cookie token, refresh-on-401) → API `POST`. Status mapping:

| API | Handler → client | UI |
|---|---|---|
| `201` | `{201, review}` | success: replace form with "Thanks — your review is posted"; `router.refresh()` re-SSRs list + stars |
| `403` | `{403, {message}}` | inline: "You can review this once you've received it." |
| `409` | `{409, {message}}` | inline: "You've already reviewed this product." |
| `400` | `{400, {message}}` | inline validation/field error (message from API) |
| `401` | `{401, …}` | `router.push('/login')` (session expired mid-submit) |

The **GET** proxy is the public variant (no auth; degrade-to-safe on upstream failure). The **POST** proxy is the authed variant (`liveAuthedDeps`). Both live in the one `[id]/reviews/` folder.

## Component responsibilities

**`ProductReviews` (server).** Fetches `getReviewsFor(id)` + `getCurrentUser()`. Renders `<section id="reviews" aria-labelledby>`: heading, **summary** (formatted `ratingAvg` — see the gotcha below), `<RatingBreakdown distribution count>`, then the two islands. **Owns the empty state** ("No reviews yet — be the first to write one") because `RatingStars`/breakdown self-hide at 0 reviews.

**`RatingBreakdown` (server, presentational).** 5→1 star rows with proportional bars (`bg-accent-400` fill on a `bg-line` track) + per-star counts from `distribution`. Pure, token-classed, no state. Self-hides / degenerate when `count === 0` (parent owns the empty copy).

**`ReviewList` (client island).** Props `productId`, `initial: ReviewPage`. State `reviews`, `nextCursor`, `loading`, `error`. Renders each review: star row, optional `title`, `body`, `authorName`, formatted `publishedAt`, and a small "Verified purchase" tag (`isVerified` is always `true` in M4a). "Load more" only when `nextCursor !== null`.

**`ReviewForm` (client island).** Props `productId`, `canAttempt: boolean`.
- `!canAttempt` → "Sign in to write a review" link (`/login`), no form.
- `canAttempt` → `noValidate` form: an accessible **rating input** (5 selectable stars with radio-group semantics — `role="radiogroup"`, arrow-key navigation, required), optional `title` + `body` via the reused `TextField`, a `SubmitButton`, and `FormError` for the inline message (all from `src/components/auth/fields.tsx`). Client-side guard: rating ∈ 1..5 required before POST. On `201`: replace with success + `router.refresh()`.

### `ratingAvg` display gotcha (from S1)

`ratingAvg` serializes as a **Decimal string** and Prisma strips trailing zeros → `GET /products/:id` may return `"4"` while the reviews `summary` returns `"4.00"` (same stored value). **Parse `ratingAvg` numeric and format for display** (e.g. one decimal place, `4.0`) — never render the raw string. Assert this in `ProductReviews`' test.

## Design tokens & accessibility

Classes only, no hex (DESIGN.md): `text-content` / `-muted` / `-subtle`, `bg-surface`, `border-line`, `text-accent-400` (filled stars) / `text-content-subtle` (empty), `text-error-600` (errors), `bg-primary-600 text-white` (filled submit — the theme-safe rule; never `bg-content`/`text-surface`). Section has an accessible `<h2>` tied via `aria-labelledby`; the star rating input is fully keyboard-operable; inline errors use `role="alert"`. Verified in **both light and dark** (RULE.md §10).

## Types (storefront-side, mirror the API views)

```ts
// src/lib/reviews.ts
export interface Review {
  id: string;
  rating: number;             // 1..5
  title: string | null;
  body: string | null;
  isVerified: boolean;        // always true in M4a
  authorName: string;
  publishedAt: string;        // ISO string over the wire
}
export interface ReviewSummary {
  ratingAvg: string | null;   // Decimal string — format numeric for display
  ratingCount: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}
export interface ReviewPage {
  data: Review[];
  nextCursor: string | null;
  summary: ReviewSummary;
}
```

## Testing (TDD — storefront Vitest + RTL)

- **`src/lib/reviews.ts`** — inject `fetch` (like `catalog.test.ts`): asserts request URL (`/products/:id/reviews?cursor=&limit=`), cursor/limit passthrough, parsed `{data, nextCursor, summary}`, typed error on non-OK.
- **Proxy `handlers.test.ts`** — `vi.fn()` deps factory (like `orders/handlers.test.ts`): `POST` maps `201/403/409/400/401` → correct `{status, body}`; unexpected errors rethrow; `GET` passes cursor/limit through and returns the list.
- **`RatingBreakdown.test.tsx`** — bar proportions + per-star counts from `distribution`; token-class assertions.
- **`ReviewList.test.tsx`** — renders the initial page; "Load more" appends the next page (stub global `fetch`); button hidden at `nextCursor === null`; load failure shows inline retry.
- **`ReviewForm.test.tsx`** — guest sees the sign-in link (not the form); logged-in sees the form; rating-required guard blocks empty submit; `201` → success message; each error status → its inline message; `role="alert"` present; keyboard star selection works.
- **`ProductReviews.test.tsx`** — summary formats `ratingAvg` for display (`"4"` → `4.0`, never the raw string); empty state at 0 reviews.

## Verification gate (RULE.md §5 + §10)

1. `npm test` (storefront) — all green incl. new specs.
2. `npm run build` (`next build`) — catches the server-only-import-in-client-bundle trap (memory `storefront-server-only-client-leak`).
3. **Browser smoke vs `ecom_dev`, light + dark screenshots each:**
   - product with reviews → SSR summary + breakdown + first page; "Load more" appends
   - logged-in delivered-purchaser → post → success → stars/list update after refresh
   - logged-in non-purchaser → 403 inline; duplicate → 409 inline
   - guest → sign-in link (no form)
   - product with 0 reviews → empty state

## Out of scope (YAGNI — unchanged from S1)

Edit/delete own review; "helpful" voting; unverified/rating-only reviews; SubOrder-based verification (M5); any API change (eligibility endpoint explicitly rejected in favor of error-driven). S3 (admin moderation queue UI) is a separate slice.

## Risks

- **Server-only import leaking into a client bundle** → `reviews.ts`/`api-reviews.ts` are `server-only`; islands talk only to the same-origin proxy. Caught by `next build` (run it — tsc + vitest won't).
- **Render-cookie trap on token refresh** → all authed writes go through the POST **route handler**, never inline in a Server Component render.
- **`ratingAvg` raw-string render** → parse + format; asserted in tests.
- **Depends on S1 merged** → branch S2 off `main` only after S1 lands (spec `2026-07-01-m4a-reviews-design.md` §merge-order). Push only; user lands the PR (memory `workflow-merge-then-resume`).
