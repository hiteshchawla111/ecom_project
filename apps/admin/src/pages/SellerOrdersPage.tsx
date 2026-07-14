import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { useConfirm } from '../components/ui/confirm';
import { SubOrderCard } from '../components/orders/SubOrderCard';
import { ACTION } from '../lib/subOrderTransitions';
import {
  fetchSubOrders,
  updateSubOrderStatus,
  type SubOrderStatus,
  type SubOrderView,
} from '../lib/sellerSubOrders';
import { ApiError } from '../lib/types';

const STATUSES: SubOrderStatus[] = [
  'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED',
];
const PAGE_SIZE = 20;

export function SellerOrdersPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<SubOrderView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<SubOrderStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cardError, setCardError] = useState<Record<string, string>>({});

  // Initial load / status-filter change: replace the list. Cancellation-guarded
  // (mirrors SellerProductsPage) so a slow stale response can't clobber a
  // newer filter's result.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSubOrders({ limit: PAGE_SIZE, status: status || undefined })
      .then((page) => {
        if (cancelled) return;
        setItems(page.data);
        setNextCursor(page.nextCursor);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : 'Could not load orders. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchSubOrders({ limit: PAGE_SIZE, status: status || undefined, cursor: nextCursor });
      setItems((prev) => [...prev, ...page.data]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load more orders. Please try again.');
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, status]);

  const onTransition = useCallback(
    async (id: string, next: SubOrderStatus) => {
      const ok = await confirm({
        title: ACTION[next].label,
        description: ACTION[next].confirm,
        // Stable dialog action label — kept distinct from the per-status card
        // button labels so the page test can target it unambiguously.
        confirmLabel: 'Confirm',
        destructive: ACTION[next].destructive,
      });
      if (!ok) return;
      setBusyId(id);
      setCardError((m) => {
        const rest = { ...m };
        delete rest[id];
        return rest;
      });
      try {
        const updated = await updateSubOrderStatus(id, next);
        setItems((prev) =>
          // Drop the card if it no longer matches the active filter, else
          // replace it in place.
          prev.flatMap((s) =>
            s.id === id ? (status && updated.status !== status ? [] : [updated]) : [s],
          ),
        );
      } catch (e) {
        setCardError((m) => ({ ...m, [id]: e instanceof ApiError ? e.message : 'The transition could not be completed. Please try again.' }));
      } finally {
        setBusyId(null);
      }
    },
    [confirm, status],
  );

  return (
    <section className="flex flex-col gap-8">
      <PageHeader eyebrow="Fulfillment" title="Orders" description="Fulfil the orders placed with your shop." />

      <label className="flex items-center gap-2 text-sm text-content-muted">
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as SubOrderStatus | '')}
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
        >
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>

      {error && (
        <p role="alert" className="text-sm text-error-600">
          {error}
        </p>
      )}

      {loading ? (
        <p role="status" aria-live="polite" className="text-content-muted">
          Loading…
        </p>
      ) : items.length === 0 ? (
        <p className="text-content-muted">No orders yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((s) => (
            <SubOrderCard
              key={s.id}
              subOrder={s}
              busy={busyId === s.id}
              error={cardError[s.id] ?? null}
              onTransition={onTransition}
            />
          ))}
        </div>
      )}

      {nextCursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="self-start rounded-md border border-line px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-content transition-colors duration-300 hover:border-content hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </section>
  );
}
