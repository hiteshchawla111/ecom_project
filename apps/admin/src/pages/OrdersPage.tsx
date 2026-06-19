import { useCallback, useEffect, useState } from 'react';
import {
  listOrders,
  type AdminOrderSummary,
  type OrderStatus,
} from '../lib/orders';
import { OrderStatusBadge } from '../components/orders/OrderStatusBadge';
import { Pagination } from '../components/ui/Pagination';

const PAGE_SIZE = 20;
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const dateFmt = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
];

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

export function OrdersPage() {
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped to force a refetch of the current page/filter (used by "Try again").
  const [refreshTick, setRefreshTick] = useState(0);

  // Refetch whenever page or status changes. Cancellation-guarded so a slow
  // stale response can't clobber a newer query (mirrors ProductsPage).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listOrders({
          page,
          pageSize: PAGE_SIZE,
          status: status || undefined,
        });
        if (cancelled) return;
        setOrders(res.data);
        setTotal(res.total);
        setTotalPages(res.totalPages);
        setError(null);
      } catch {
        if (!cancelled) setError('Could not load orders. Please try again.');
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

  function onStatusChange(next: OrderStatus | '') {
    setPage(1); // a new filter resets to the first page
    setStatus(next);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl font-semibold text-neutral-900">
          Orders
        </h2>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          Status
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value as OrderStatus | '')}
            className="rounded-md border border-neutral-200 bg-neutral-0 px-3 py-1.5 text-sm text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
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
        <p role="status" aria-live="polite" className="text-neutral-600">
          Loading…
        </p>
      ) : error ? null : orders.length === 0 ? (
        <p className="text-neutral-600">No orders found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-100 text-neutral-600">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Customer
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Total
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Items
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Placed
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="border-t border-neutral-200 text-neutral-900 transition-colors hover:bg-neutral-50"
                >
                  <td className="px-4 py-2">
                    <div className="font-medium">{order.customerName}</div>
                    <div className="text-xs text-neutral-600">
                      {order.customerEmail}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    {usd.format(Number(order.grandTotal))}
                  </td>
                  <td className="px-4 py-2 text-right">{order.itemCount}</td>
                  <td className="px-4 py-2 text-neutral-600">
                    {dateFmt.format(new Date(order.createdAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && orders.length > 0 && (
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
