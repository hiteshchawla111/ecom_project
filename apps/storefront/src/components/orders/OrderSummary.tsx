import { formatPrice } from '@/lib/money';
import type { OrderView } from '@/lib/api-orders';
import { OrderStatusBadge } from './OrderStatusBadge';

/** Presentational order detail — items, totals, shipping snapshot. Reusable by
 *  the order confirmation page and (later) order history. */
export function OrderSummary({ order }: { order: OrderView }) {
  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <div className="flex-1">
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm text-neutral-600">Status</span>
          <OrderStatusBadge status={order.status} />
        </div>
        <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
          {order.items.map((item) => (
            <li key={item.productId} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span className="min-w-0 truncate text-neutral-900">
                <span>{item.productName}</span>
                {' × '}
                <span>{item.quantity}</span>
              </span>
              <span className="tabular-nums text-neutral-900">{formatPrice(item.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <h2 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-600">
          Shipping to
        </h2>
        <address className="not-italic text-sm text-neutral-900">
          {order.shipFullName}<br />
          {order.shipLine1}<br />
          {order.shipLine2 && <>{order.shipLine2}<br /></>}
          {order.shipCity}, {order.shipState} {order.shipPostalCode}<br />
          {order.shipCountry}
        </address>
      </div>

      <aside className="w-full shrink-0 rounded-lg border border-neutral-200 bg-neutral-0 p-6 lg:w-80">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-600">Summary</h2>
        <dl className="flex flex-col gap-2 text-sm">
          {/* discountTotal intentionally omitted — out of PRD scope (always 0.00) */}
          <Row label="Subtotal" value={order.subtotal} />
          <Row label="Tax" value={order.taxTotal} />
          <Row label="Shipping" value={order.shippingTotal} />
          <div className="mt-2 border-t border-neutral-200 pt-2">
            <Row label="Total" value={order.grandTotal} bold />
          </div>
        </dl>
      </aside>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className={bold ? 'font-semibold text-neutral-900' : 'text-neutral-600'}>{label}</dt>
      <dd className={bold ? 'font-semibold text-neutral-900' : 'text-neutral-900'}>{formatPrice(value)}</dd>
    </div>
  );
}
