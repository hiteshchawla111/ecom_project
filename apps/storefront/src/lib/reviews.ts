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
