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
