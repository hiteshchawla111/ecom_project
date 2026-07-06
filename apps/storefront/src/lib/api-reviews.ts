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
