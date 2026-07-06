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
