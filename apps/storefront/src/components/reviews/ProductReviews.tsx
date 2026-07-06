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
