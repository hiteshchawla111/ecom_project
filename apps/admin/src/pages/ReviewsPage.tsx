import { useCallback, useEffect, useState } from 'react';
import {
  listAdminReviews,
  hideReview,
  unhideReview,
  type AdminReview,
  type ReviewVisibility,
} from '../lib/reviews';
import { Pagination } from '../components/ui/Pagination';
import { RowActionsMenu } from '../components/ui/RowActionsMenu';
import { useConfirm } from '../components/ui/confirm';
import { ReviewStatusBadge } from '../components/reviews/ReviewStatusBadge';

const PAGE_SIZE = 20;

const VISIBILITY_TO_PARAM: Record<ReviewVisibility, 'true' | 'false' | undefined> = {
  all: undefined,
  visible: 'false',
  hidden: 'true',
};

export function ReviewsPage() {
  const confirm = useConfirm();
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [visibility, setVisibility] = useState<ReviewVisibility>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => setRefreshTick((t) => t + 1), []);

  // Refetch whenever page, visibility, or refreshTick changes. Cancellation-guarded
  // so a slow stale response can't clobber a newer query (mirrors SellersPage).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listAdminReviews({
          page,
          pageSize: PAGE_SIZE,
          isHidden: VISIBILITY_TO_PARAM[visibility],
        });
        if (cancelled) return;
        // Step back if we ran off the end (e.g. hid the last row on the last page).
        if (page > 1 && res.data.length === 0) {
          setPage((p) => p - 1);
          return;
        }
        setReviews(res.data);
        setTotal(res.total);
        setTotalPages(res.totalPages);
        setError(null);
      } catch {
        if (!cancelled) setError('Could not load reviews. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [page, visibility, refreshTick]);

  function onVisibilityChange(next: ReviewVisibility) {
    setPage(1); // a new filter resets to the first page
    setVisibility(next);
  }

  async function onToggleHidden(r: AdminReview) {
    const hiding = !r.isHidden;
    const ok = await confirm({
      title: hiding ? 'Hide this review?' : 'Restore this review?',
      description: hiding
        ? 'It will no longer be visible on the storefront and will be excluded from the product rating.'
        : 'It will become visible again and count toward the product rating.',
      confirmLabel: hiding ? 'Hide' : 'Unhide',
    });
    if (!ok) return;
    setBusyId(r.id);
    try {
      await (hiding ? hideReview(r.id) : unhideReview(r.id));
      reload();
    } catch {
      setError('Could not update the review. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <h1 className="font-serif text-3xl font-medium tracking-tight text-content">
          Reviews
        </h1>
        <label className="flex items-center gap-2 text-sm text-content-muted">
          Visibility
          <select
            value={visibility}
            onChange={(e) => onVisibilityChange(e.target.value as ReviewVisibility)}
            className="border border-line bg-surface px-3 py-2 text-sm text-content focus:border-content focus:outline-none focus:ring-1 focus:ring-content"
          >
            <option value="all">All</option>
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
      </header>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-error-500/10 px-4 py-3 text-sm text-error-500"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={reload}
            className="rounded-md border border-error-500 px-3 py-1.5 text-xs font-medium text-error-500 transition-colors hover:bg-error-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-error-500"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <p role="status" aria-live="polite" className="text-content-muted">
          Loading…
        </p>
      ) : error ? null : reviews.length === 0 ? (
        <p className="text-content-muted">No reviews found.</p>
      ) : (
        <div className="overflow-x-auto border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-content-subtle">
              <tr>
                <th scope="col" className="px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.1em]">
                  Product
                </th>
                <th scope="col" className="px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.1em]">
                  Author
                </th>
                <th scope="col" className="px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.1em]">
                  Rating
                </th>
                <th scope="col" className="px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.1em]">
                  Review
                </th>
                <th scope="col" className="px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.1em]">
                  Status
                </th>
                <th scope="col" className="px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.1em]">
                  Created
                </th>
                <th scope="col" className="px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.1em]">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-line text-content transition-colors hover:bg-surface-muted/50"
                >
                  <td className="max-w-[10rem] truncate px-5 py-3.5 font-mono text-xs text-content-muted">
                    {r.productId}
                  </td>
                  <td className="px-5 py-3.5">
                    {r.authorName}
                    {r.isVerified && (
                      <span className="ml-2 text-[0.65rem] font-medium uppercase tracking-[0.1em] text-success-500">
                        Verified
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-content-muted">
                    ★ {r.rating}/5
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="font-bold text-content">{r.title ?? '—'}</p>
                    <p className="line-clamp-2 text-content-muted">
                      {r.body ?? '—'}
                    </p>
                  </td>
                  <td className="px-5 py-3.5">
                    <ReviewStatusBadge isHidden={r.isHidden} />
                  </td>
                  <td className="px-5 py-3.5 text-content-muted">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <RowActionsMenu label={`Actions for ${r.authorName}'s review`}>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => onToggleHidden(r)}
                      >
                        {r.isHidden ? 'Unhide' : 'Hide'}
                      </button>
                    </RowActionsMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && reviews.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}
    </section>
  );
}
