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
    if (!window.confirm(ACTION[next].confirm)) return;
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
      <p role="status" aria-live="polite" className="text-neutral-600">
        Loading…
      </p>
    );
  }

  if (notFound) {
    return (
      <section className="flex flex-col gap-4">
        <p className="text-neutral-600">Order not found.</p>
        <Link to="/orders" className="text-sm text-primary-700 hover:underline">
          ← Back to orders
        </Link>
      </section>
    );
  }

  if (error && !order) {
    return (
      <section className="flex flex-col gap-4">
        <div role="alert" className="rounded-md bg-error-500/10 px-4 py-3 text-sm text-error-500">
          {error}
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

  if (!order) return null;

  const transitions = nextStatuses(order.status);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link to="/orders" className="text-sm text-primary-700 hover:underline">
          ← Back to orders
        </Link>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-2xl font-semibold text-neutral-900">
            Order
          </h2>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-sm text-neutral-600">
          Placed {dateFmt.format(new Date(order.createdAt))}
        </p>
      </header>

      {error && (
        <div role="alert" className="rounded-md bg-error-500/10 px-4 py-3 text-sm text-error-500">
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
                    ? 'rounded-md border border-error-500 px-4 py-2 text-sm font-medium text-error-500 transition-colors hover:bg-error-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-error-500 disabled:opacity-50'
                    : 'rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50'
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
        <div className="lg:col-span-2 overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-100 text-neutral-600">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Product</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Unit</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Qty</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Line</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.productId} className="border-t border-neutral-200 text-neutral-900">
                  <td className="px-4 py-2 font-medium">{item.productName}</td>
                  <td className="px-4 py-2 text-right">{money(item.unitPrice)}</td>
                  <td className="px-4 py-2 text-right">{item.quantity}</td>
                  <td className="px-4 py-2 text-right">{money(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-neutral-200 text-neutral-900">
              <tr>
                <td colSpan={3} className="px-4 py-1.5 text-right text-neutral-600">Subtotal</td>
                <td className="px-4 py-1.5 text-right">{money(order.subtotal)}</td>
              </tr>
              {Number(order.discountTotal) > 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-1.5 text-right text-neutral-600">Discount</td>
                  <td className="px-4 py-1.5 text-right">−{money(order.discountTotal)}</td>
                </tr>
              )}
              <tr>
                <td colSpan={3} className="px-4 py-1.5 text-right text-neutral-600">Tax</td>
                <td className="px-4 py-1.5 text-right">{money(order.taxTotal)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-4 py-1.5 text-right text-neutral-600">Shipping</td>
                <td className="px-4 py-1.5 text-right">{money(order.shippingTotal)}</td>
              </tr>
              <tr className="font-semibold">
                <td colSpan={3} className="px-4 py-2 text-right">Total</td>
                <td className="px-4 py-2 text-right">{money(order.grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Customer + shipping */}
        <aside className="flex flex-col gap-4">
          <div className="rounded-lg border border-neutral-200 p-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Customer
            </h3>
            <p className="font-medium text-neutral-900">{order.customerName}</p>
            <p className="text-sm text-neutral-600">{order.customerEmail}</p>
          </div>
          <div className="rounded-lg border border-neutral-200 p-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Shipping
            </h3>
            <address className="text-sm not-italic text-neutral-900">
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
