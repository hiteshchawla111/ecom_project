# M4a S2 — Storefront Reviews UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reviews section to the storefront product detail page (`/products/[id]`) that consumes the merged M4a S1 reviews API — SSR summary + distribution + first-page list, client "Load more" cursor pagination, and an error-driven customer review form.

**Architecture:** A server component (`ProductReviews`) fetches the first review page + the current user server-side, renders the SEO-visible summary/distribution/list markup, and mounts two client islands: `ReviewList` (owns "Load more") and `ReviewForm` (logged-in only; error-driven submit). Public reads go through a `server-only` client (`lib/reviews.ts`) called directly from the server; the authed create and the client "Load more" both go through a same-origin 4-file route-handler proxy under `app/api/products/[id]/reviews/`. No API changes.

**Tech Stack:** Next.js App Router + TypeScript, Tailwind (DESIGN.md tokens), Vitest + React Testing Library. Mirrors existing storefront patterns: `lib/catalog.ts` (public read client), `lib/api-orders.ts` + `lib/api-authed.ts` (authed write), `app/api/orders/*` (4-file proxy), `components/auth/fields.tsx` (form primitives).

## Global Constraints

- **Design tokens only, no hardcoded hex** (DESIGN.md via Tailwind): `text-content`/`-muted`/`-subtle`, `bg-surface`, `border-line`, `text-accent-400` (filled star) / `text-content-subtle` (empty star), `text-error-600` (error), `bg-primary-600 text-white` for any brand-filled button (never `bg-content`/`text-surface` on new filled buttons — those wash out in dark mode). Reused `SubmitButton` keeps its existing classes as-is.
- **Strict TypeScript, no `any`.** Types mirror the API views; prices/`ratingAvg` are Decimal **strings**, not numbers.
- **`ratingAvg` display:** parse numeric and format (one decimal, e.g. `4.0`); never render the raw Decimal string (Prisma strips trailing zeros → `"4"`).
- **`server-only` boundary:** `lib/reviews.ts` and `lib/api-reviews.ts` import `'server-only'`. Client islands (`ReviewList`, `ReviewForm`) talk **only** to the same-origin `/api/...` proxy, never to `lib/*`.
- **No API changes.** Ships on the merged S1 surface. Eligibility is error-driven (map `403/409/400/401`).
- **Fixed dev port :5001** for the storefront (per `apps/storefront/CLAUDE.md`).
- **Branch off `main` after S1 is merged** (branch `feat/reviews-storefront`). Push only — the user lands PRs.
- **Commands** (run from `apps/storefront/`): `npm test -- <pattern>` (single), `npm test` (all), `npm run build` (`next build`), `npm run lint`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/reviews.ts` (create) | `server-only` public read client: `Review`/`ReviewSummary`/`ReviewPage` types, `listReviews(productId, query, opts)`, `getReviewsFor(productId)` wrapper. |
| `src/lib/api-reviews.ts` (create) | `server-only` authed write client: `CreateReviewInput`, `ReviewView`, `createReview(productId, input, deps)` over `authedRequest`. |
| `src/app/api/products/[id]/reviews/handlers.ts` (create) | Pure `handleCreateReview` + `handleListReviews` → `{status, body}`; `ReviewsRouteDeps` interface; `ApiAuthError` mapping. |
| `src/app/api/products/[id]/reviews/route-deps.ts` (create) | `server-only` `liveReviewsRouteDeps()` — wires create (authed) + list (public). |
| `src/app/api/products/[id]/reviews/route.ts` (create) | Next `POST` + `GET` handlers; `params: Promise<{id}>`. |
| `src/components/reviews/RatingBreakdown.tsx` (create) | Server, presentational: 5→1 distribution bars + counts. |
| `src/components/reviews/ReviewList.tsx` (create) | Client island: initial page + "Load more". |
| `src/components/reviews/ReviewForm.tsx` (create) | Client island: gated form / sign-in link; error-driven submit. |
| `src/components/reviews/ProductReviews.tsx` (create) | Server: section shell, summary, empty state; fetches list + user; mounts islands. |
| `src/app/products/[id]/page.tsx` (modify) | Render `<ProductReviews productId={id} />` between the grid and `<RelatedProducts>`. |

Build order: read client → write client → proxy → presentational → islands → server shell → page wiring. Each task ends green + committed.

---

### Task 1: `lib/reviews.ts` — public read client

**Files:**
- Create: `src/lib/reviews.ts`
- Test: `src/lib/reviews.test.ts`

**Interfaces:**
- Consumes: `apiBaseUrl()` from `@/lib/env`.
- Produces:
  - `interface Review { id: string; rating: number; title: string | null; body: string | null; isVerified: boolean; authorName: string; publishedAt: string }`
  - `interface ReviewSummary { ratingAvg: string | null; ratingCount: number; distribution: Record<'1'|'2'|'3'|'4'|'5', number> }`
  - `interface ReviewPage { data: Review[]; nextCursor: string | null; summary: ReviewSummary }`
  - `interface ReviewsQuery { cursor?: string; limit?: number }`
  - `interface ReviewsOptions { baseUrl: string; fetch?: typeof fetch }`
  - `listReviews(productId: string, query: ReviewsQuery, opts: ReviewsOptions): Promise<ReviewPage>`
  - `getReviewsFor(productId: string, query?: ReviewsQuery): Promise<ReviewPage>` (binds `apiBaseUrl()`)
  - `class ReviewsError extends Error { status: number }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/reviews.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { listReviews, type ReviewPage } from './reviews';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const PAGE: ReviewPage = {
  data: [
    {
      id: 'r1',
      rating: 5,
      title: 'Great',
      body: 'Loved it',
      isVerified: true,
      authorName: 'Ada',
      publishedAt: '2026-07-01T00:00:00.000Z',
    },
  ],
  nextCursor: '2026-07-01T00:00:00.000Z_r1',
  summary: {
    ratingAvg: '4.00',
    ratingCount: 3,
    distribution: { '1': 0, '2': 0, '3': 1, '4': 0, '5': 2 },
  },
};

describe('listReviews', () => {
  it('requests the product reviews endpoint with cursor + limit and returns the page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, PAGE));
    const result = await listReviews(
      'p1',
      { cursor: 'c1', limit: 10 },
      { baseUrl: 'http://api.test', fetch: fetchMock },
    );
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('http://api.test/products/p1/reviews');
    expect(url).toContain('cursor=c1');
    expect(url).toContain('limit=10');
    expect(result).toEqual(PAGE);
  });

  it('omits undefined query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, PAGE));
    await listReviews('p1', {}, { baseUrl: 'http://api.test', fetch: fetchMock });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe('http://api.test/products/p1/reviews');
  });

  it('throws ReviewsError with the status on a non-OK response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { message: 'boom' }));
    await expect(
      listReviews('p1', {}, { baseUrl: 'http://api.test', fetch: fetchMock }),
    ).rejects.toMatchObject({ status: 500, message: 'boom' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- reviews.test.ts`
Expected: FAIL — cannot resolve `./reviews` / `listReviews is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/reviews.ts`:

```ts
import 'server-only';
import { apiBaseUrl } from './env';

/**
 * Typed, server-side client for the public reviews endpoint (`apps/api`
 * reviews). Server Components call this directly; the browser never does
 * (the public list is @Public on the API). Mirrors lib/catalog.ts.
 *
 * `ratingAvg` arrives as a Decimal-serialized string (never a number).
 */

export interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  isVerified: boolean;
  authorName: string;
  publishedAt: string;
}

export interface ReviewSummary {
  ratingAvg: string | null;
  ratingCount: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface ReviewPage {
  data: Review[];
  nextCursor: string | null;
  summary: ReviewSummary;
}

export interface ReviewsQuery {
  cursor?: string;
  limit?: number;
}

export interface ReviewsOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export class ReviewsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ReviewsError';
  }
}

interface ApiErrorBody {
  message?: string | string[];
  error?: string;
}

function messageFrom(body: unknown, status: number): string {
  const b = body as ApiErrorBody | null;
  if (b && Array.isArray(b.message)) return b.message.join(', ');
  if (b && typeof b.message === 'string') return b.message;
  if (b && typeof b.error === 'string') return b.error;
  return `Request failed with status ${status}`;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export async function listReviews(
  productId: string,
  query: ReviewsQuery,
  { baseUrl, fetch: fetchImpl = fetch }: ReviewsOptions,
): Promise<ReviewPage> {
  const url = `${baseUrl}/products/${productId}/reviews${toQuery({
    cursor: query.cursor,
    limit: query.limit,
  })}`;
  const res = await fetchImpl(url, { cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new ReviewsError(messageFrom(body, res.status), res.status);
  return body as ReviewPage;
}

/** Server-bound convenience wrapper (Server Components). */
export function getReviewsFor(
  productId: string,
  query: ReviewsQuery = {},
): Promise<ReviewPage> {
  return listReviews(productId, query, { baseUrl: apiBaseUrl() });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- reviews.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reviews.ts src/lib/reviews.test.ts
git commit -m "feat(storefront): reviews public read client (lib/reviews.ts)"
```

---

### Task 2: `lib/api-reviews.ts` — authed write client

**Files:**
- Create: `src/lib/api-reviews.ts`
- Test: `src/lib/api-reviews.test.ts`

**Interfaces:**
- Consumes: `authedRequest`, `AuthedApiDeps` from `@/lib/api-authed`.
- Produces:
  - `interface CreateReviewInput { rating: number; title?: string; body?: string }`
  - `interface ReviewView { id: string; rating: number; title: string | null; body: string | null; isVerified: boolean; authorName: string; publishedAt: string | null }`
  - `createReview(productId: string, input: CreateReviewInput, deps: AuthedApiDeps): Promise<ReviewView>`
  - re-export `type { AuthedApiDeps }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/api-reviews.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createReview } from './api-reviews';
import type { AuthedApiDeps } from './api-authed';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function deps(fetchMock: ReturnType<typeof vi.fn>): AuthedApiDeps {
  return {
    baseUrl: 'http://api.test',
    getAccessToken: () => 'access-token',
    getRefreshToken: () => 'refresh-token',
    onTokensRefreshed: vi.fn(),
    onSessionInvalid: vi.fn(),
    fetch: fetchMock,
  };
}

describe('createReview', () => {
  it('POSTs the review to the product reviews endpoint and returns the created view', async () => {
    const created = {
      id: 'r1',
      rating: 5,
      title: 'Great',
      body: 'Loved it',
      isVerified: true,
      authorName: 'Ada',
      publishedAt: '2026-07-06T00:00:00.000Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, created));
    const result = await createReview(
      'p1',
      { rating: 5, title: 'Great', body: 'Loved it' },
      deps(fetchMock),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/products/p1/reviews');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      rating: 5,
      title: 'Great',
      body: 'Loved it',
    });
    expect(result).toEqual(created);
  });

  it('propagates the ApiAuthError status on a rejected create (e.g. 403)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(403, { message: 'not delivered' }));
    await expect(
      createReview('p1', { rating: 5 }, deps(fetchMock)),
    ).rejects.toMatchObject({ status: 403, message: 'not delivered' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- api-reviews.test.ts`
Expected: FAIL — cannot resolve `./api-reviews`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/api-reviews.ts`:

```ts
import 'server-only';
import { authedRequest, type AuthedApiDeps } from './api-authed';

export type { AuthedApiDeps } from './api-authed';

/** Payload for creating a review (mirrors API CreateReviewDto). */
export interface CreateReviewInput {
  rating: number;
  title?: string;
  body?: string;
}

/** The created review (mirrors API ReviewView; publishedAt is a JSON string). */
export interface ReviewView {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  isVerified: boolean;
  authorName: string;
  publishedAt: string | null;
}

/** Create a review for a product. Requires an authenticated customer;
 *  the delivered-purchase gate (403) and one-per-product (409) are enforced
 *  by the API and surface as ApiAuthError with the respective status. */
export function createReview(
  productId: string,
  input: CreateReviewInput,
  deps: AuthedApiDeps,
): Promise<ReviewView> {
  return authedRequest<ReviewView>(
    `/products/${productId}/reviews`,
    { method: 'POST', body: JSON.stringify(input) },
    deps,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- api-reviews.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/api-reviews.ts src/lib/api-reviews.test.ts
git commit -m "feat(storefront): reviews authed write client (lib/api-reviews.ts)"
```

---

### Task 3: Route-handler proxy — `handlers.ts` + `route-deps.ts` + `route.ts`

**Files:**
- Create: `src/app/api/products/[id]/reviews/handlers.ts`
- Create: `src/app/api/products/[id]/reviews/route-deps.ts`
- Create: `src/app/api/products/[id]/reviews/route.ts`
- Test: `src/app/api/products/[id]/reviews/handlers.test.ts`

**Interfaces:**
- Consumes: `ApiAuthError` from `@/lib/api-auth`; `CreateReviewInput`, `ReviewView`, `createReview` from `@/lib/api-reviews`; `ReviewPage`, `ReviewsQuery`, `listReviews`, `getReviewsFor` from `@/lib/reviews`; `liveAuthedDeps` from `@/lib/api-authed`; `apiBaseUrl` from `@/lib/env`.
- Produces:
  - `interface ReviewsHandlerResult { status: number; body: unknown }`
  - `interface ReviewsRouteDeps { create(productId: string, input: CreateReviewInput): Promise<ReviewView>; list(productId: string, query: ReviewsQuery): Promise<ReviewPage> }`
  - `handleCreateReview(productId, input: Partial<CreateReviewInput>, deps): Promise<ReviewsHandlerResult>`
  - `handleListReviews(productId, query: { cursor?: string; limit?: string }, deps): Promise<ReviewsHandlerResult>`
  - `liveReviewsRouteDeps(): ReviewsRouteDeps`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/products/[id]/reviews/handlers.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { handleCreateReview, handleListReviews } from './handlers';
import type { ReviewsRouteDeps } from './handlers';
import { ApiAuthError } from '@/lib/api-auth';

function deps(over: Partial<ReviewsRouteDeps> = {}): ReviewsRouteDeps {
  return {
    create: vi.fn(),
    list: vi.fn(),
    ...over,
  };
}

describe('handleCreateReview', () => {
  it('rejects a missing/invalid rating with 400 before calling create', async () => {
    const d = deps();
    const result = await handleCreateReview('p1', {}, d);
    expect(result.status).toBe(400);
    expect(d.create).not.toHaveBeenCalled();
  });

  it('rejects a rating outside 1..5 with 400', async () => {
    const d = deps();
    expect((await handleCreateReview('p1', { rating: 0 }, d)).status).toBe(400);
    expect((await handleCreateReview('p1', { rating: 6 }, d)).status).toBe(400);
  });

  it('returns 201 with the created review on success', async () => {
    const created = {
      id: 'r1',
      rating: 5,
      title: null,
      body: null,
      isVerified: true,
      authorName: 'Ada',
      publishedAt: '2026-07-06T00:00:00.000Z',
    };
    const create = vi.fn().mockResolvedValue(created);
    const result = await handleCreateReview('p1', { rating: 5 }, deps({ create }));
    expect(create).toHaveBeenCalledWith('p1', { rating: 5, title: undefined, body: undefined });
    expect(result).toEqual({ status: 201, body: created });
  });

  it.each([403, 409, 400, 401])(
    'maps an ApiAuthError %i to { status, body: { message } }',
    async (status) => {
      const create = vi.fn().mockRejectedValue(new ApiAuthError('nope', status));
      const result = await handleCreateReview('p1', { rating: 5 }, deps({ create }));
      expect(result).toEqual({ status, body: { message: 'nope' } });
    },
  );

  it('rethrows an unexpected (non-ApiAuthError) error', async () => {
    const create = vi.fn().mockRejectedValue(new Error('kaboom'));
    await expect(
      handleCreateReview('p1', { rating: 5 }, deps({ create })),
    ).rejects.toThrow('kaboom');
  });
});

describe('handleListReviews', () => {
  it('passes cursor + parsed limit through and returns the page', async () => {
    const page = {
      data: [],
      nextCursor: null,
      summary: { ratingAvg: null, ratingCount: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } },
    };
    const list = vi.fn().mockResolvedValue(page);
    const result = await handleListReviews('p1', { cursor: 'c1', limit: '10' }, deps({ list }));
    expect(list).toHaveBeenCalledWith('p1', { cursor: 'c1', limit: 10 });
    expect(result).toEqual({ status: 200, body: page });
  });

  it('degrades an upstream failure to an empty page (200) so the page never breaks', async () => {
    const list = vi.fn().mockRejectedValue(new Error('upstream down'));
    const result = await handleListReviews('p1', {}, deps({ list }));
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ data: [], nextCursor: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "api/products/\[id\]/reviews/handlers.test.ts"`
Expected: FAIL — cannot resolve `./handlers`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/api/products/[id]/reviews/handlers.ts`:

```ts
import { ApiAuthError } from '@/lib/api-auth';
import type { CreateReviewInput, ReviewView } from '@/lib/api-reviews';
import type { ReviewPage, ReviewsQuery } from '@/lib/reviews';

export interface ReviewsHandlerResult {
  status: number;
  body: unknown;
}

/** Injectable ops so handlers are testable without cookies/Next/network. */
export interface ReviewsRouteDeps {
  create(productId: string, input: CreateReviewInput): Promise<ReviewView>;
  list(productId: string, query: ReviewsQuery): Promise<ReviewPage>;
}

const EMPTY_PAGE: ReviewPage = {
  data: [],
  nextCursor: null,
  summary: {
    ratingAvg: null,
    ratingCount: 0,
    distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
  },
};

function badRequest(message: string): ReviewsHandlerResult {
  return { status: 400, body: { message } };
}

/** Map an upstream API error to a client result; rethrow the unexpected. */
function fromApiError(err: unknown): ReviewsHandlerResult {
  if (err instanceof ApiAuthError) {
    return { status: err.status, body: { message: err.message } };
  }
  throw err;
}

function isValidRating(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

export async function handleCreateReview(
  productId: string,
  input: Partial<CreateReviewInput>,
  deps: ReviewsRouteDeps,
): Promise<ReviewsHandlerResult> {
  if (!isValidRating(input.rating)) {
    return badRequest('Rating must be an integer from 1 to 5.');
  }
  try {
    const review = await deps.create(productId, {
      rating: input.rating,
      title: input.title,
      body: input.body,
    });
    return { status: 201, body: review };
  } catch (err) {
    return fromApiError(err);
  }
}

function clampLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(50, Math.max(1, Math.trunc(n)));
}

export async function handleListReviews(
  productId: string,
  query: { cursor?: string; limit?: string },
  deps: ReviewsRouteDeps,
): Promise<ReviewsHandlerResult> {
  try {
    const page = await deps.list(productId, {
      cursor: query.cursor,
      limit: clampLimit(query.limit),
    });
    return { status: 200, body: page };
  } catch (err) {
    // Load-more must never break the page — degrade to an empty page.
    console.error('[reviews] list upstream failure:', err);
    return { status: 200, body: EMPTY_PAGE };
  }
}
```

Create `src/app/api/products/[id]/reviews/route-deps.ts`:

```ts
import 'server-only';
import { createReview } from '@/lib/api-reviews';
import { listReviews } from '@/lib/reviews';
import { liveAuthedDeps } from '@/lib/api-authed';
import { apiBaseUrl } from '@/lib/env';
import type { ReviewsRouteDeps } from './handlers';

export function liveReviewsRouteDeps(): ReviewsRouteDeps {
  return {
    create: async (productId, input) =>
      createReview(productId, input, await liveAuthedDeps()),
    list: (productId, query) =>
      listReviews(productId, query, { baseUrl: apiBaseUrl() }),
  };
}
```

Create `src/app/api/products/[id]/reviews/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { handleCreateReview, handleListReviews } from './handlers';
import { liveReviewsRouteDeps } from './route-deps';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const result = await handleListReviews(
    id,
    {
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    },
    liveReviewsRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handleCreateReview(
    id,
    {
      rating: input.rating as number | undefined,
      title: input.title as string | undefined,
      body: input.body as string | undefined,
    },
    liveReviewsRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- "api/products/\[id\]/reviews/handlers.test.ts"`
Expected: PASS (all cases in both describe blocks).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/products/[id]/reviews"
git commit -m "feat(storefront): reviews route-handler proxy (POST create + GET list)"
```

---

### Task 4: `RatingBreakdown` — distribution bars (presentational)

**Files:**
- Create: `src/components/reviews/RatingBreakdown.tsx`
- Test: `src/components/reviews/RatingBreakdown.test.tsx`

**Interfaces:**
- Consumes: `ReviewSummary['distribution']` shape from `@/lib/reviews`.
- Produces: `RatingBreakdown({ distribution, count }: { distribution: Record<'1'|'2'|'3'|'4'|'5', number>; count: number })` — server component, no `'use client'`.

- [ ] **Step 1: Write the failing test**

Create `src/components/reviews/RatingBreakdown.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RatingBreakdown } from './RatingBreakdown';

const DIST = { '1': 0, '2': 0, '3': 1, '4': 0, '5': 3 } as const;

describe('RatingBreakdown', () => {
  it('renders a row per star (5 down to 1) with its count', () => {
    render(<RatingBreakdown distribution={DIST} count={4} />);
    // Each star row shows its label and count.
    expect(screen.getByText('5 stars')).toBeInTheDocument();
    expect(screen.getByText('1 star')).toBeInTheDocument();
    expect(screen.getByTestId('breakdown-count-5')).toHaveTextContent('3');
    expect(screen.getByTestId('breakdown-count-3')).toHaveTextContent('1');
    expect(screen.getByTestId('breakdown-count-1')).toHaveTextContent('0');
  });

  it('sizes each bar proportionally to the total count', () => {
    render(<RatingBreakdown distribution={DIST} count={4} />);
    // 5-star: 3/4 = 75%.
    expect(screen.getByTestId('breakdown-bar-5')).toHaveStyle({ width: '75%' });
    // 1-star: 0/4 = 0%.
    expect(screen.getByTestId('breakdown-bar-1')).toHaveStyle({ width: '0%' });
  });

  it('renders 0% bars (no divide-by-zero) when count is 0', () => {
    render(
      <RatingBreakdown
        distribution={{ '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }}
        count={0}
      />,
    );
    expect(screen.getByTestId('breakdown-bar-5')).toHaveStyle({ width: '0%' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- RatingBreakdown.test.tsx`
Expected: FAIL — cannot resolve `./RatingBreakdown`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/reviews/RatingBreakdown.tsx`:

```tsx
import type { ReviewSummary } from '@/lib/reviews';

interface RatingBreakdownProps {
  distribution: ReviewSummary['distribution'];
  count: number;
}

const STARS = ['5', '4', '3', '2', '1'] as const;

/**
 * Rating distribution: one row per star (5→1), a proportional bar, and the
 * per-star count. Presentational + server-rendered (no client JS). The parent
 * owns the empty-state copy; a zero total renders 0%-width bars (no NaN).
 */
export function RatingBreakdown({ distribution, count }: RatingBreakdownProps) {
  return (
    <ul className="flex flex-col gap-1.5">
      {STARS.map((star) => {
        const n = distribution[star];
        const pct = count > 0 ? Math.round((n / count) * 100) : 0;
        return (
          <li key={star} className="flex items-center gap-3 text-sm">
            <span className="w-14 shrink-0 text-content-muted">
              {star} {star === '1' ? 'star' : 'stars'}
            </span>
            <span
              className="relative h-2 flex-1 overflow-hidden bg-line"
              aria-hidden="true"
            >
              <span
                data-testid={`breakdown-bar-${star}`}
                className="absolute inset-y-0 left-0 bg-accent-400"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span
              data-testid={`breakdown-count-${star}`}
              className="w-8 shrink-0 text-right tabular-nums text-content-muted"
            >
              {n}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- RatingBreakdown.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/reviews/RatingBreakdown.tsx src/components/reviews/RatingBreakdown.test.tsx
git commit -m "feat(storefront): RatingBreakdown distribution bars"
```

---

### Task 5: `ReviewList` — client island with "Load more"

**Files:**
- Create: `src/components/reviews/ReviewList.tsx`
- Test: `src/components/reviews/ReviewList.test.tsx`

**Interfaces:**
- Consumes: `Review`, `ReviewPage` from `@/lib/reviews`.
- Produces: `ReviewList({ productId, initial }: { productId: string; initial: ReviewPage })` — client component (`'use client'`). Fetches `GET /api/products/${productId}/reviews?cursor=&limit=10` for more pages.

- [ ] **Step 1: Write the failing test**

Create `src/components/reviews/ReviewList.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReviewList } from './ReviewList';
import type { ReviewPage } from '@/lib/reviews';

function review(id: string, rating = 5, authorName = 'Ada'): ReviewPage['data'][number] {
  return {
    id,
    rating,
    title: `Title ${id}`,
    body: `Body ${id}`,
    isVerified: true,
    authorName,
    publishedAt: '2026-07-01T00:00:00.000Z',
  };
}

const SUMMARY: ReviewPage['summary'] = {
  ratingAvg: '5.00',
  ratingCount: 2,
  distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 2 },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ReviewList', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders the initial reviews with author and verified tag', () => {
    const initial: ReviewPage = { data: [review('r1')], nextCursor: null, summary: SUMMARY };
    render(<ReviewList productId="p1" initial={initial} />);
    expect(screen.getByText('Title r1')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText(/verified purchase/i)).toBeInTheDocument();
  });

  it('hides "Load more" when nextCursor is null', () => {
    const initial: ReviewPage = { data: [review('r1')], nextCursor: null, summary: SUMMARY };
    render(<ReviewList productId="p1" initial={initial} />);
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('appends the next page and requests the proxy with the cursor', async () => {
    const initial: ReviewPage = {
      data: [review('r1')],
      nextCursor: 'cur-1',
      summary: SUMMARY,
    };
    const nextPage: ReviewPage = {
      data: [review('r2')],
      nextCursor: null,
      summary: SUMMARY,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, nextPage));
    vi.stubGlobal('fetch', fetchMock);

    render(<ReviewList productId="p1" initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));

    await waitFor(() => expect(screen.getByText('Title r2')).toBeInTheDocument());
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/products/p1/reviews');
    expect(url).toContain('cursor=cur-1');
    expect(url).toContain('limit=10');
    // nextCursor now null → button gone.
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('shows an inline retry message on a load failure without breaking existing reviews', async () => {
    const initial: ReviewPage = { data: [review('r1')], nextCursor: 'cur-1', summary: SUMMARY };
    const fetchMock = vi.fn().mockRejectedValue(new Error('network'));
    vi.stubGlobal('fetch', fetchMock);

    render(<ReviewList productId="p1" initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));

    await waitFor(() =>
      expect(screen.getByText(/couldn.t load more reviews/i)).toBeInTheDocument(),
    );
    // Existing review still visible; button still available to retry.
    expect(screen.getByText('Title r1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ReviewList.test.tsx`
Expected: FAIL — cannot resolve `./ReviewList`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/reviews/ReviewList.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { Review, ReviewPage } from '@/lib/reviews';

interface ReviewListProps {
  productId: string;
  initial: ReviewPage;
}

const PAGE_LIMIT = 10;
const STAR_COUNT = 5;

function StarRow({ rating }: { rating: number }) {
  return (
    <span aria-label={`Rated ${rating} out of 5`} className="flex text-sm">
      {Array.from({ length: STAR_COUNT }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={i < rating ? 'text-accent-400' : 'text-content-subtle'}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function ReviewItem({ review }: { review: Review }) {
  return (
    <li className="flex flex-col gap-2 border-t border-line py-6">
      <StarRow rating={review.rating} />
      {review.title ? (
        <h3 className="font-medium text-content">{review.title}</h3>
      ) : null}
      {review.body ? (
        <p className="leading-relaxed text-content-muted">{review.body}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-subtle">
        <span className="text-content-muted">{review.authorName}</span>
        {review.isVerified ? (
          <span className="uppercase tracking-[0.1em] text-success-500">
            Verified purchase
          </span>
        ) : null}
        {review.publishedAt ? <span>{formatDate(review.publishedAt)}</span> : null}
      </div>
    </li>
  );
}

export function ReviewList({ productId, initial }: ReviewListProps) {
  const [reviews, setReviews] = useState<Review[]>(initial.data);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        cursor: nextCursor,
        limit: String(PAGE_LIMIT),
      });
      const res = await fetch(
        `/api/products/${productId}/reviews?${params.toString()}`,
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      const page = (await res.json()) as ReviewPage;
      setReviews((prev) => [...prev, ...page.data]);
      setNextCursor(page.nextCursor);
    } catch {
      setError('Couldn’t load more reviews. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col">
        {reviews.map((r) => (
          <ReviewItem key={r.id} review={r} />
        ))}
      </ul>
      {error ? (
        <p role="alert" className="py-3 text-sm text-error-600">
          {error}
        </p>
      ) : null}
      {nextCursor ? (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="mt-4 self-start border border-line px-6 py-3 text-xs font-medium uppercase tracking-[0.14em] text-content transition-colors hover:border-content disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ReviewList.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/reviews/ReviewList.tsx src/components/reviews/ReviewList.test.tsx
git commit -m "feat(storefront): ReviewList island with cursor Load more"
```

---

### Task 6: `ReviewForm` — client island (gated, error-driven)

**Files:**
- Create: `src/components/reviews/ReviewForm.tsx`
- Test: `src/components/reviews/ReviewForm.test.tsx`

**Interfaces:**
- Consumes: `TextField`, `FormError`, `SubmitButton` from `@/components/auth/fields`; `useRouter` from `next/navigation`.
- Produces: `ReviewForm({ productId, canAttempt }: { productId: string; canAttempt: boolean })` — client component. POSTs to `/api/products/${productId}/reviews`.

**Note on `useRouter` in tests:** mock `next/navigation` at the top of the test file (the storefront's existing pattern for client components that navigate — see `CheckoutView.test.tsx`).

- [ ] **Step 1: Write the failing test**

Create `src/components/reviews/ReviewForm.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReviewForm } from './ReviewForm';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ReviewForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    push.mockClear();
    refresh.mockClear();
  });

  it('shows a sign-in link (not the form) when the user cannot attempt', () => {
    render(<ReviewForm productId="p1" canAttempt={false} />);
    const link = screen.getByRole('link', { name: /sign in to write a review/i });
    expect(link).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: /post review/i })).toBeNull();
  });

  it('renders the form for a logged-in customer', () => {
    render(<ReviewForm productId="p1" canAttempt={true} />);
    expect(screen.getByRole('radiogroup', { name: /your rating/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /post review/i })).toBeInTheDocument();
  });

  it('blocks submit with an inline error when no rating is selected', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ReviewForm productId="p1" canAttempt={true} />);
    fireEvent.click(screen.getByRole('button', { name: /post review/i }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/select a rating/i),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('selects a rating via keyboard and posts, then shows success + refreshes', async () => {
    const created = { id: 'r1', rating: 4 };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, created));
    vi.stubGlobal('fetch', fetchMock);
    render(<ReviewForm productId="p1" canAttempt={true} />);

    // Click the 4th star.
    fireEvent.click(screen.getByRole('radio', { name: /4 stars/i }));
    fireEvent.click(screen.getByRole('button', { name: /post review/i }));

    await waitFor(() =>
      expect(screen.getByText(/thanks.*your review is posted/i)).toBeInTheDocument(),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/products/p1/reviews');
    expect(JSON.parse(init.body as string)).toMatchObject({ rating: 4 });
    expect(refresh).toHaveBeenCalled();
  });

  it.each([
    [403, /received/i],
    [409, /already reviewed/i],
    [400, /rating must be/i],
  ])('maps a %i response to an inline message', async (status, matcher) => {
    const messages: Record<number, string> = {
      403: 'You can only review a product you have received.',
      409: 'You have already reviewed this product.',
      400: 'Rating must be an integer from 1 to 5.',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(status, { message: messages[status] }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ReviewForm productId="p1" canAttempt={true} />);
    fireEvent.click(screen.getByRole('radio', { name: /5 stars/i }));
    fireEvent.click(screen.getByRole('button', { name: /post review/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(matcher));
    expect(push).not.toHaveBeenCalled();
  });

  it('redirects to /login on a 401 (session expired mid-submit)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { message: 'nope' }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ReviewForm productId="p1" canAttempt={true} />);
    fireEvent.click(screen.getByRole('radio', { name: /5 stars/i }));
    fireEvent.click(screen.getByRole('button', { name: /post review/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ReviewForm.test.tsx`
Expected: FAIL — cannot resolve `./ReviewForm`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/reviews/ReviewForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TextField, FormError, SubmitButton } from '@/components/auth/fields';

interface ReviewFormProps {
  productId: string;
  /** Whether the current viewer is a logged-in customer who may attempt a review. */
  canAttempt: boolean;
}

const STAR_COUNT = 5;

/** Accessible 5-star radiogroup. Click or arrow-key to select. */
function RatingInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Your rating"
      className="flex flex-col gap-2"
    >
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-content-subtle">
        Your rating
      </span>
      <div className="flex gap-1">
        {Array.from({ length: STAR_COUNT }, (_, i) => {
          const star = i + 1;
          const selected = star <= value;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
              onClick={() => onChange(star)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  onChange(Math.min(STAR_COUNT, value + 1 || 1));
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  onChange(Math.max(1, value - 1));
                }
              }}
              className={`text-2xl leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 ${
                selected ? 'text-accent-400' : 'text-content-subtle'
              }`}
            >
              ★
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ReviewForm({ productId, canAttempt }: ReviewFormProps) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (!canAttempt) {
    return (
      <div className="border-t border-line pt-6">
        <Link
          href="/login"
          className="text-sm font-medium text-content underline underline-offset-4 transition-colors hover:text-primary-600"
        >
          Sign in to write a review
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="border-t border-line pt-6">
        <p className="text-sm text-success-500">
          Thanks — your review is posted.
        </p>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      setError('Please select a rating from 1 to 5.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/reviews`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rating,
          title: title.trim() || undefined,
          body: body.trim() || undefined,
        }),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setError(data?.message ?? 'Could not post your review.');
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError('Could not post your review. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-4 border-t border-line pt-6"
    >
      <h3 className="font-heading text-lg text-content">Write a review</h3>
      <RatingInput value={rating} onChange={setRating} />
      <TextField
        label="Title (optional)"
        name="title"
        value={title}
        onChange={setTitle}
      />
      <TextField
        label="Review (optional)"
        name="body"
        value={body}
        onChange={setBody}
      />
      <FormError message={error} />
      <div className="max-w-xs">
        <SubmitButton pending={pending}>Post review</SubmitButton>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ReviewForm.test.tsx`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/reviews/ReviewForm.tsx src/components/reviews/ReviewForm.test.tsx
git commit -m "feat(storefront): ReviewForm island (gated, error-driven submit)"
```

---

### Task 7: `ProductReviews` server shell + wire into the product page

**Files:**
- Create: `src/components/reviews/ProductReviews.tsx`
- Test: `src/components/reviews/ProductReviews.test.tsx`
- Modify: `src/app/products/[id]/page.tsx` (add the section between the grid `</div>` at line ~162 and `<RelatedProducts>` at line ~164)

**Interfaces:**
- Consumes: `getReviewsFor` from `@/lib/reviews`; `getCurrentUser` from `@/lib/session`; `RatingBreakdown`, `ReviewList`, `ReviewForm`.
- Produces: `ProductReviews({ productId }: { productId: string }): Promise<JSX.Element>` — async server component. `formatAvg(ratingAvg: string | null): string | null` (exported for the test).

**Note:** `ProductReviews` is an async server component. Test it by mocking its data deps (`@/lib/reviews`, `@/lib/session`) and awaiting the component to get its element, then rendering — mirroring how server components with data are unit-tested here. If the repo has no precedent for rendering an async server component in Vitest, split the pure display formatter out and test that directly plus test the child wiring via the mocked data; **at minimum, unit-test `formatAvg` and the empty-state branch**.

- [ ] **Step 1: Write the failing test**

Create `src/components/reviews/ProductReviews.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatAvg, ProductReviews } from './ProductReviews';
import type { ReviewPage } from '@/lib/reviews';

vi.mock('@/lib/reviews', () => ({ getReviewsFor: vi.fn() }));
vi.mock('@/lib/session', () => ({ getCurrentUser: vi.fn() }));

import { getReviewsFor } from '@/lib/reviews';
import { getCurrentUser } from '@/lib/session';

const withReviews: ReviewPage = {
  data: [
    {
      id: 'r1',
      rating: 4,
      title: 'Solid',
      body: 'Works well',
      isVerified: true,
      authorName: 'Ada',
      publishedAt: '2026-07-01T00:00:00.000Z',
    },
  ],
  nextCursor: null,
  summary: {
    ratingAvg: '4', // Prisma strips the trailing zero — must display as 4.0
    ratingCount: 1,
    distribution: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 0 },
  },
};

const empty: ReviewPage = {
  data: [],
  nextCursor: null,
  summary: {
    ratingAvg: null,
    ratingCount: 0,
    distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
  },
};

describe('formatAvg', () => {
  it('formats a raw Decimal string to one decimal place', () => {
    expect(formatAvg('4')).toBe('4.0');
    expect(formatAvg('4.00')).toBe('4.0');
    expect(formatAvg('4.5')).toBe('4.5');
  });
  it('returns null when there is no average', () => {
    expect(formatAvg(null)).toBeNull();
  });
});

describe('ProductReviews', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the formatted average, count and a review when there are reviews', async () => {
    vi.mocked(getReviewsFor).mockResolvedValue(withReviews);
    vi.mocked(getCurrentUser).mockResolvedValue({ sub: 'u1', email: 'a@b.c', role: 'CUSTOMER' });
    render(await ProductReviews({ productId: 'p1' }));
    expect(screen.getByText('4.0')).toBeInTheDocument();
    expect(screen.getByText(/1 review/i)).toBeInTheDocument();
    expect(screen.getByText('Solid')).toBeInTheDocument();
    // Logged-in → form present.
    expect(screen.getByRole('button', { name: /post review/i })).toBeInTheDocument();
  });

  it('shows the empty state and a sign-in link for a guest with no reviews', async () => {
    vi.mocked(getReviewsFor).mockResolvedValue(empty);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    render(await ProductReviews({ productId: 'p1' }));
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in to write a review/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ProductReviews.test.tsx`
Expected: FAIL — cannot resolve `./ProductReviews`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/reviews/ProductReviews.tsx`:

```tsx
import { getReviewsFor } from '@/lib/reviews';
import { getCurrentUser } from '@/lib/session';
import { RatingBreakdown } from './RatingBreakdown';
import { ReviewList } from './ReviewList';
import { ReviewForm } from './ReviewForm';

interface ProductReviewsProps {
  productId: string;
}

/** Format the API's Decimal-string average to one decimal for display.
 *  Prisma strips trailing zeros ("4"), so never render the raw string. */
export function formatAvg(ratingAvg: string | null): string | null {
  if (ratingAvg == null) return null;
  const n = Number(ratingAvg);
  if (Number.isNaN(n)) return null;
  return n.toFixed(1);
}

/** Product reviews section: SSR summary + distribution + first page, plus the
 *  client Load-more list and the (gated) review form. */
export async function ProductReviews({ productId }: ProductReviewsProps) {
  const [page, user] = await Promise.all([
    getReviewsFor(productId, { limit: 10 }),
    getCurrentUser(),
  ]);
  const { summary } = page;
  const avg = formatAvg(summary.ratingAvg);
  const hasReviews = summary.ratingCount > 0;

  return (
    <section
      id="reviews"
      aria-labelledby="reviews-heading"
      className="flex flex-col gap-8 border-t border-line pt-12"
    >
      <h2
        id="reviews-heading"
        className="font-heading text-2xl font-medium text-content sm:text-3xl"
      >
        Customer reviews
      </h2>

      {hasReviews ? (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div className="flex flex-col gap-4">
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-4xl text-content">{avg}</span>
              <span className="text-content-subtle">out of 5</span>
            </div>
            <span className="text-sm text-content-muted">
              {summary.ratingCount}{' '}
              {summary.ratingCount === 1 ? 'review' : 'reviews'}
            </span>
            <RatingBreakdown
              distribution={summary.distribution}
              count={summary.ratingCount}
            />
          </div>
          <ReviewList productId={productId} initial={page} />
        </div>
      ) : (
        <p className="text-content-muted">
          No reviews yet — be the first to write one.
        </p>
      )}

      <ReviewForm productId={productId} canAttempt={!!user} />
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ProductReviews.test.tsx`
Expected: PASS (formatAvg + both ProductReviews cases). If awaiting the async component fails to render in this repo's Vitest setup, keep the `formatAvg` tests and the empty-state assertion driven through the mocked data; do not weaken the display-format assertion.

- [ ] **Step 5: Wire into the product page**

Modify `src/app/products/[id]/page.tsx`:

Add the import near the other component imports (after the `RatingStars` import, line ~10):

```tsx
import { ProductReviews } from '@/components/reviews/ProductReviews';
```

Then place the section between the closing `</div>` of the two-column grid (line ~162) and `<RelatedProducts products={related} />` (line ~164):

```tsx
      </div>

      <ProductReviews productId={product.id} />

      <RelatedProducts products={related} />
    </main>
```

- [ ] **Step 6: Run the full suite + build**

Run: `npm test`
Expected: PASS — all storefront tests including the new reviews specs.

Run: `npm run build`
Expected: `next build` succeeds (this is the gate that catches a `server-only` import leaking into a client bundle — tsc + vitest will not).

Run: `npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/reviews/ProductReviews.tsx src/components/reviews/ProductReviews.test.tsx "src/app/products/[id]/page.tsx"
git commit -m "feat(storefront): ProductReviews section wired into product detail page"
```

---

## Final Verification (before declaring the slice done — RULE.md §5 + §10)

Not a code task — a manual gate after Task 7.

- [ ] `npm test` green (all suites); `npm run build` succeeds; `npm run lint` clean.
- [ ] **Browser smoke vs `ecom_dev`** (start API on :5000 and storefront on :5001), **screenshot light + dark for each**:
  - [ ] Product with reviews → SSR summary (formatted avg, e.g. `4.0`), distribution bars, first page of reviews.
  - [ ] "Load more" appends the next page; button disappears at the end.
  - [ ] Logged-in **delivered-purchaser** → select rating → Post review → success message → after refresh the stars/summary/list reflect the new review.
  - [ ] Logged-in **non-purchaser** → 403 inline ("…received it"); posting again after a real review → 409 inline ("already reviewed").
  - [ ] **Guest** → sign-in link, no form.
  - [ ] Product with **0 reviews** → empty state ("No reviews yet…").
- [ ] Confirm no console errors and WCAG basics: keyboard-operable star rating, `role="alert"` errors announced, section heading present.
- [ ] Update `docs/IMPLEMENTATION_PLAN.md` M4a status line: mark **S2 (storefront) ✅** with a one-line summary + test counts.
- [ ] STOP and ask the user to verify (RULE.md §1). Push only when asked; the user lands the PR.

## Self-Review Notes (author)

- **Spec coverage:** eligibility=error-driven (Tasks 3 + 6), form logged-in-only + guest sign-in link (Task 6 + 7), SSR first page + Load more (Tasks 5 + 7), Approach A composition (Tasks 4–7), `ratingAvg` display gotcha (Task 7 `formatAvg` + test), authed proxy + public read + refresh-on-401 (Tasks 1–3), tests per component, `next build` gate (Task 7), light/dark smoke (final gate). All covered.
- **Type consistency:** `Review`/`ReviewSummary`/`ReviewPage`/`ReviewsQuery` (Task 1) reused by Tasks 3/5/7; `CreateReviewInput`/`ReviewView` (Task 2) reused by Task 3; `ReviewsRouteDeps`/`ReviewsHandlerResult` (Task 3) reused by route-deps/route; `ProductReviews`/`formatAvg` (Task 7) exported for its test. Names consistent across tasks.
- **No placeholders:** every code step shows full content.
