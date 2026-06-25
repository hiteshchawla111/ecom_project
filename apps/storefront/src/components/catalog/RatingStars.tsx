interface RatingStarsProps {
  /** Average rating as a Decimal string (e.g. "4.50"), or null when no reviews. */
  ratingAvg: string | null;
  /** Number of published reviews. */
  ratingCount: number;
}

const STAR_COUNT = 5;

/**
 * Product rating display. Renders 5 stars filled to the rounded average, the
 * numeric average, and the review count. Renders nothing until the product has
 * at least one review (ratingCount > 0 and a non-null average) — so it stays
 * invisible until M4a Reviews populates the aggregate columns.
 */
export function RatingStars({ ratingAvg, ratingCount }: RatingStarsProps) {
  if (ratingCount <= 0 || ratingAvg == null) return null;

  const avg = Number(ratingAvg);
  const filled = Math.round(avg);

  return (
    <div
      className="flex items-center gap-1.5 text-sm"
      aria-label={`Rated ${ratingAvg} out of 5 from ${ratingCount} reviews`}
    >
      <span aria-hidden="true" className="flex">
        {Array.from({ length: STAR_COUNT }, (_, i) => (
          <span
            key={i}
            className={i < filled ? 'text-accent-400' : 'text-content-subtle'}
          >
            ★
          </span>
        ))}
      </span>
      <span className="font-medium text-content">{ratingAvg}</span>
      <span className="text-content-muted">({ratingCount})</span>
    </div>
  );
}
