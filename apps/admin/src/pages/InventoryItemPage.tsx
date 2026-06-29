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
      <p role="status" aria-live="polite" className="text-content-muted">
        Loading…
      </p>
    );
  }

  if (notFound) {
    return (
      <section className="flex flex-col gap-4">
        <p className="text-content-muted">Inventory item not found.</p>
        <Link to="/inventory" className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-content-muted transition-colors hover:text-content">
          ← Back to inventory
        </Link>
      </section>
    );
  }

  if (loadError && !item) {
    return (
      <section className="flex flex-col gap-4">
        <div role="alert" className="bg-error-500/10 px-4 py-3 text-sm text-error-500">
          {loadError}
        </div>
        <button
          type="button"
          onClick={reload}
          className="self-start border border-line px-4 py-2 text-[0.7rem] font-medium uppercase tracking-[0.1em] text-content transition-colors hover:border-content"
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
    <section className="flex flex-col gap-8">
      <div>
        <Link to="/inventory" className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-content-muted transition-colors hover:text-content">
          ← Back to inventory
        </Link>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-3xl font-medium tracking-tight text-content">
            {item.name}
          </h2>
          <p className="text-sm tabular-nums text-content-muted">{item.sku}</p>
        </div>
        <LowStockBadge low={item.isLowStock} />
      </header>

      {/* Counters */}
      <dl className="grid grid-cols-3 gap-4">
        <div className="border border-line bg-surface p-6">
          <dt className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-content-subtle">Available</dt>
          <dd className="mt-2 font-serif text-4xl font-medium tabular-nums text-content">{item.available}</dd>
        </div>
        <div className="border border-line bg-surface p-6">
          <dt className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-content-subtle">Reserved</dt>
          <dd className="mt-2 font-serif text-4xl font-medium tabular-nums text-content">{item.reserved}</dd>
        </div>
        <div className="border border-line bg-surface p-6">
          <dt className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-content-subtle">Threshold</dt>
          <dd className="mt-2 font-serif text-4xl font-medium tabular-nums text-content">{item.lowStockThreshold}</dd>
        </div>
      </dl>

      {/* Adjustment form */}
      <form onSubmit={onSubmit} className="flex flex-col gap-5 border border-line bg-surface p-6">
        <h3 className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-content-subtle">
          Post a stock movement
        </h3>
        {formError && (
          <div role="alert" className="bg-error-500/10 px-4 py-2 text-sm text-error-600">
            {formError}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-2 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-content-subtle">
            Type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ManualMovementType)}
              className="border border-line bg-surface px-3.5 py-2.5 text-sm text-content transition-colors focus:border-content focus:outline-none focus:ring-1 focus:ring-content"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-content-subtle">
            {qtyLabel}
            <input
              type="number"
              min={0}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-40 border border-line bg-surface px-3.5 py-2.5 text-sm text-content transition-colors focus:border-content focus:outline-none focus:ring-1 focus:ring-content"
            />
          </label>
          <label className="flex flex-1 flex-col gap-2 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-content-subtle">
            Reason
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. restock, damaged, cycle count"
              className="border border-line bg-surface px-3.5 py-2.5 text-sm text-content transition-colors focus:border-content focus:outline-none focus:ring-1 focus:ring-content"
            />
          </label>
        </div>
        {type === 'ADJUSTMENT' && (
          <p className="text-xs text-content-subtle">
            Adjustment sets available to the exact count entered (a recount), not a delta.
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="self-start bg-primary-600 px-6 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors duration-300 hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50"
        >
          Post movement
        </button>
      </form>

      {/* Movement history */}
      <div className="flex flex-col gap-2">
        <h3 className="font-heading text-lg font-semibold text-content">
          Movement history
        </h3>
        {item.movements.length === 0 ? (
          <p className="text-content-muted">No movements yet.</p>
        ) : (
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-content-subtle">
                <tr>
                  <th scope="col" className="px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.1em]">Type</th>
                  <th scope="col" className="px-5 py-3 text-right text-[0.7rem] font-medium uppercase tracking-[0.1em]">Qty</th>
                  <th scope="col" className="px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.1em]">Reason</th>
                  <th scope="col" className="px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.1em]">When</th>
                </tr>
              </thead>
              <tbody>
                {item.movements.map((m, i) => (
                  <tr key={i} className="border-t border-line text-content">
                    <td className="px-5 py-3.5">{MOVEMENT_LABEL[m.type] ?? m.type}</td>
                    <td className="px-5 py-3.5 text-right">
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td className="px-5 py-3.5 text-content-muted">
                      {m.reason ?? (m.orderId ? `order ${m.orderId}` : '—')}
                    </td>
                    <td className="px-5 py-3.5 text-content-muted">
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
