import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listSellers,
  type SellerListRow,
  type SellerStatus,
} from '../lib/sellers';
import { SellerStatusBadge } from '../components/sellers/SellerStatusBadge';
import { Pagination } from '../components/ui/Pagination';

const PAGE_SIZE = 20;
const dateFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

const STATUSES: SellerStatus[] = [
  'PENDING_REVIEW',
  'ACTIVE',
  'SUSPENDED',
  'DEACTIVATED',
];

const STATUS_LABEL: Record<SellerStatus, string> = {
  PENDING_REVIEW: 'Pending review',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  DEACTIVATED: 'Deactivated',
};

export function SellersPage() {
  const [sellers, setSellers] = useState<SellerListRow[]>([]);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<SellerStatus | ''>('');
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped to force a refetch of the current page/filter (used by "Try again").
  const [refreshTick, setRefreshTick] = useState(0);

  // Refetch whenever page or status changes. Cancellation-guarded so a slow
  // stale response can't clobber a newer query (mirrors OrdersPage).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listSellers({
          page,
          pageSize: PAGE_SIZE,
          status: status || undefined,
        });
        if (cancelled) return;
        setSellers(res.data);
        setTotal(res.total);
        setTotalPages(res.totalPages);
        setError(null);
      } catch {
        if (!cancelled) setError('Could not load sellers. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [page, status, refreshTick]);

  const reload = useCallback(() => setRefreshTick((t) => t + 1), []);

  function onStatusChange(next: SellerStatus | '') {
    setPage(1); // a new filter resets to the first page
    setStatus(next);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold text-content">
          Sellers
        </h1>
        <label className="flex items-center gap-2 text-sm text-content-muted">
          Status
          <select
            value={status}
            onChange={(e) =>
              onStatusChange(e.target.value as SellerStatus | '')
            }
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
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
      ) : error ? null : sellers.length === 0 ? (
        <p className="text-content-muted">No sellers found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted text-content-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Seller
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Slug
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  KYC
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-line text-content transition-colors hover:bg-surface-sunk"
                >
                  <td className="px-4 py-2">
                    <Link
                      to={`/sellers/${s.id}`}
                      className="font-medium text-primary-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
                    >
                      {s.displayName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-content-muted">{s.slug}</td>
                  <td className="px-4 py-2 text-content-muted">
                    {s.kycPresent ? 'Provided' : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <SellerStatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-2 text-content-muted">
                    {dateFmt.format(new Date(s.createdAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && sellers.length > 0 && (
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
