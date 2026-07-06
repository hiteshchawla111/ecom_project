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
