import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getOrder,
  updateOrderStatus,
  type AdminOrderDetail,
  type OrderStatus,
} from '../lib/orders';
import { nextStatuses } from '../lib/orderTransitions';
import { OrderStatusBadge } from '../components/orders/OrderStatusBadge';
import { useConfirm } from '../components/ui/confirm';
import { ApiError } from '../lib/types';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const dateFmt = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** The action label + confirmation copy for transitioning to a given status. */
const ACTION: Record<OrderStatus, { label: string; confirm: string }> = {
  PENDING: { label: 'Mark pending', confirm: 'Mark this order pending?' },
  CONFIRMED: { label: 'Confirm order', confirm: 'Confirm this order?' },
  PROCESSING: {
    label: 'Mark processing',
    confirm: 'Mark this order as processing?',
  },
  SHIPPED: { label: 'Mark shipped', confirm: 'Mark this order as shipped?' },
  DELIVERED: {
    label: 'Mark delivered',
    confirm: 'Mark this order as delivered?',
  },
  CANCELLED: {
    label: 'Cancel order',
    confirm: 'Cancel this order? Reserved stock will be released.',
  },
  REFUNDED: {
    label: 'Refund order',
    confirm: 'Refund this order? The items will be restocked.',
  },
};

const money = (v: string) => usd.format(Number(v));

export function OrderDetailPage() {
  const confirm = useConfirm();
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getOrder(id!);
        if (cancelled) return;
        setOrder(res);
        setNotFound(false);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError('Could not load this order. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, refreshTick]);

  const reload = useCallback(() => setRefreshTick((t) => t + 1), []);

  async function onTransition(next: OrderStatus) {
    if (!order) return;
    const ok = await confirm({
      title: ACTION[next].label ?? 'Update order',
      description: ACTION[next].confirm,
      confirmLabel: 'Confirm',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateOrderStatus(order.id, next);
      setOrder(updated);
    } catch {
      setError('The status change could not be completed. Please try again.');
    } finally {
      setBusy(false);
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
        <p className="text-content-muted">Order not found.</p>
        <Link to="/orders" className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-content-muted transition-colors hover:text-content">
          ← Back to orders
        </Link>
      </section>
    );
  }

  if (error && !order) {
    return (
      <section className="flex flex-col gap-4">
        <div role="alert" className="bg-error-500/10 px-4 py-3 text-sm text-error-500">
          {error}
        </div>
        <button
          type="button"
          onClick={reload}
          className="self-start rounded-md border border-line px-3 py-1.5 text-xs font-medium text-content hover:bg-surface-muted"
        >
          Try again
        </button>
      </section>
    );
  }

  if (!order) return null;

  const transitions = nextStatuses(order.status);

  return (
    <section className="flex flex-col gap-8">
      <div>
        <Link to="/orders" className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-content-muted transition-colors hover:text-content">
          ← Back to orders
        </Link>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-serif text-3xl font-medium tracking-tight text-content">
            Order
          </h2>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-sm text-content-muted">
          Placed {dateFmt.format(new Date(order.createdAt))}
        </p>
      </header>

      {error && (
        <div role="alert" className="bg-error-500/10 px-4 py-3 text-sm text-error-500">
          {error}
        </div>
      )}

      {transitions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {transitions.map((next) => {
            const destructive = next === 'CANCELLED' || next === 'REFUNDED';
            return (
              <button
                key={next}
                type="button"
                disabled={busy}
                onClick={() => void onTransition(next)}
                className={
                  destructive
                    ? 'border border-error-500 px-6 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-error-600 transition-colors duration-300 hover:bg-error-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-error-500 disabled:opacity-50'
                    : 'bg-primary-600 px-6 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors duration-300 hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50'
                }
              >
                {ACTION[next].label}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Items + totals */}
        <div className="lg:col-span-2 overflow-x-auto border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-content-subtle">
              <tr>
                <th scope="col" className="px-5 py-3 text-[0.7rem] font-medium uppercase tracking-[0.1em]">Product</th>
                <th scope="col" className="px-5 py-3 text-right text-[0.7rem] font-medium uppercase tracking-[0.1em]">Unit</th>
                <th scope="col" className="px-5 py-3 text-right text-[0.7rem] font-medium uppercase tracking-[0.1em]">Qty</th>
                <th scope="col" className="px-5 py-3 text-right text-[0.7rem] font-medium uppercase tracking-[0.1em]">Line</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.productId} className="border-t border-line text-content">
                  <td className="px-5 py-3.5 font-medium">{item.productName}</td>
                  <td className="px-5 py-3.5 text-right">{money(item.unitPrice)}</td>
                  <td className="px-5 py-3.5 text-right">{item.quantity}</td>
                  <td className="px-5 py-3.5 text-right">{money(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-line text-content">
              <tr>
                <td colSpan={3} className="px-4 py-1.5 text-right text-content-muted">Subtotal</td>
                <td className="px-4 py-1.5 text-right">{money(order.subtotal)}</td>
              </tr>
              {Number(order.discountTotal) > 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-1.5 text-right text-content-muted">Discount</td>
                  <td className="px-4 py-1.5 text-right">−{money(order.discountTotal)}</td>
                </tr>
              )}
              <tr>
                <td colSpan={3} className="px-4 py-1.5 text-right text-content-muted">Tax</td>
                <td className="px-4 py-1.5 text-right">{money(order.taxTotal)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-4 py-1.5 text-right text-content-muted">Shipping</td>
                <td className="px-4 py-1.5 text-right">{money(order.shippingTotal)}</td>
              </tr>
              <tr className="font-semibold">
                <td colSpan={3} className="px-5 py-3.5 text-right">Total</td>
                <td className="px-5 py-3.5 text-right">{money(order.grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Customer + shipping */}
        <aside className="flex flex-col gap-4">
          <div className="border border-line bg-surface p-6">
            <h3 className="mb-3 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-content-subtle">
              Customer
            </h3>
            <p className="font-medium text-content">{order.customerName}</p>
            <p className="text-sm text-content-muted">{order.customerEmail}</p>
          </div>
          <div className="border border-line bg-surface p-6">
            <h3 className="mb-3 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-content-subtle">
              Shipping
            </h3>
            <address className="text-sm not-italic text-content">
              {order.shipFullName}
              <br />
              {order.shipLine1}
              {order.shipLine2 && (
                <>
                  <br />
                  {order.shipLine2}
                </>
              )}
              <br />
              {order.shipCity}, {order.shipState} {order.shipPostalCode}
              <br />
              {order.shipCountry}
            </address>
          </div>
        </aside>
      </div>
    </section>
  );
}
