import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getStockItem,
  createMovement,
  type ManualMovementType,
  type MovementType,
  type StockItemView,
} from '../lib/inventory';
import { LowStockBadge } from '../components/inventory/LowStockBadge';
import { ApiError } from '../lib/types';

const dateFmt = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const TYPE_OPTIONS: { value: ManualMovementType; label: string }[] = [
  { value: 'ADDITION', label: 'Addition (receive stock)' },
  { value: 'DEDUCTION', label: 'Deduction (damaged / lost)' },
  { value: 'ADJUSTMENT', label: 'Adjustment (recount)' },
];

const MOVEMENT_LABEL: Record<MovementType, string> = {
  ADDITION: 'Addition',
  DEDUCTION: 'Deduction',
  ADJUSTMENT: 'Adjustment',
  RESERVATION: 'Reservation',
  RELEASE: 'Release',
};

export function InventoryItemPage() {
  const { productId } = useParams<{ productId: string }>();
  const [item, setItem] = useState<StockItemView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Adjustment form state.
  const [type, setType] = useState<ManualMovementType>('ADDITION');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getStockItem(productId!);
        if (cancelled) return;
        setItem(res);
        setNotFound(false);
        setLoadError(null);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setLoadError('Could not load this item. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [productId, refreshTick]);

  const reload = useCallback(() => setRefreshTick((t) => t + 1), []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) return;
    const qty = Number(quantity);
    // ADJUSTMENT is an absolute recount (0 is valid — "none on hand"); ADDITION
    // and DEDUCTION are deltas and must be at least 1 (matches the API guard,
    // so a zero entry is caught here instead of as a generic API error).
    const minQty = type === 'ADJUSTMENT' ? 0 : 1;
    if (!Number.isInteger(qty) || qty < minQty) {
      setFormError(
        type === 'ADJUSTMENT'
          ? 'Quantity must be a non-negative whole number.'
          : 'Quantity must be a whole number of at least 1.',
      );
      return;
    }
    if (!reason.trim()) {
      setFormError('A reason is required.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createMovement(productId, { type, quantity: qty, reason: reason.trim() });
      setQuantity('');
      setReason('');
      reload(); // refetch counters + movement history
    } catch {
      setFormError('The adjustment could not be posted. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <p role="status" aria-live="polite" className="text-neutral-600">
        Loading…
      </p>
    );
  }

  if (notFound) {
    return (
      <section className="flex flex-col gap-4">
        <p className="text-neutral-600">Inventory item not found.</p>
        <Link to="/inventory" className="text-sm text-primary-700 hover:underline">
          ← Back to inventory
        </Link>
      </section>
    );
  }

  if (loadError && !item) {
    return (
      <section className="flex flex-col gap-4">
        <div role="alert" className="rounded-md bg-error-500/10 px-4 py-3 text-sm text-error-500">
          {loadError}
        </div>
        <button
          type="button"
          onClick={reload}
          className="self-start rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-neutral-100"
        >
          Try again
        </button>
      </section>
    );
  }

  if (!item) return null;

  const qtyLabel =
    type === 'ADJUSTMENT' ? 'New available count' : 'Quantity';

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link to="/inventory" className="text-sm text-primary-700 hover:underline">
          ← Back to inventory
        </Link>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl font-semibold text-neutral-900">
            {item.name}
          </h2>
          <p className="text-sm text-neutral-600">{item.sku}</p>
        </div>
        <LowStockBadge low={item.isLowStock} />
      </header>

      {/* Counters */}
      <dl className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-neutral-200 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Available</dt>
          <dd className="mt-1 text-2xl font-semibold text-neutral-900">{item.available}</dd>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Reserved</dt>
          <dd className="mt-1 text-2xl font-semibold text-neutral-900">{item.reserved}</dd>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Threshold</dt>
          <dd className="mt-1 text-2xl font-semibold text-neutral-900">{item.lowStockThreshold}</dd>
        </div>
      </dl>

      {/* Adjustment form */}
      <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4">
        <h3 className="font-heading text-lg font-semibold text-neutral-900">
          Post a stock movement
        </h3>
        {formError && (
          <div role="alert" className="rounded-md bg-error-500/10 px-4 py-2 text-sm text-error-500">
            {formError}
          </div>
        )}
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm text-neutral-600">
            Type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ManualMovementType)}
              className="rounded-md border border-neutral-200 bg-neutral-0 px-3 py-1.5 text-sm text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-600">
            {qtyLabel}
            <input
              type="number"
              min={0}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-40 rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm text-neutral-600">
            Reason
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. restock, damaged, cycle count"
              className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
            />
          </label>
        </div>
        {type === 'ADJUSTMENT' && (
          <p className="text-xs text-neutral-500">
            Adjustment sets available to the exact count entered (a recount), not a delta.
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="self-start rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50"
        >
          Post movement
        </button>
      </form>

      {/* Movement history */}
      <div className="flex flex-col gap-2">
        <h3 className="font-heading text-lg font-semibold text-neutral-900">
          Movement history
        </h3>
        {item.movements.length === 0 ? (
          <p className="text-neutral-600">No movements yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-100 text-neutral-600">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Qty</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Reason</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {item.movements.map((m, i) => (
                  <tr key={i} className="border-t border-neutral-200 text-neutral-900">
                    <td className="px-4 py-2">{MOVEMENT_LABEL[m.type] ?? m.type}</td>
                    <td className="px-4 py-2 text-right">
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td className="px-4 py-2 text-neutral-600">
                      {m.reason ?? (m.orderId ? `order ${m.orderId}` : '—')}
                    </td>
                    <td className="px-4 py-2 text-neutral-600">
                      {dateFmt.format(new Date(m.createdAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
