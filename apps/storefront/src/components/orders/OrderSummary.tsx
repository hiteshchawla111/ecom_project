import { formatPrice } from '@/lib/money';
import type { OrderView } from '@/lib/api-orders';
import { OrderStatusBadge } from './OrderStatusBadge';

/** Presentational order detail — items, totals, shipping snapshot. Reusable by
 *  the order confirmation page and (later) order history. */
export function OrderSummary({ order }: { order: OrderView }) {
  return (
    <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">
      <div className="flex-1">
        <div className="mb-5 flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-content-subtle">
            Status
          </span>
          <OrderStatusBadge status={order.status} />
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {order.items.map((item) => (
            <li key={item.productId} className="flex items-center justify-between gap-4 py-4">
              <span className="min-w-0 flex-1 truncate text-content">
                {item.productName}
                <span className="text-content-subtle"> × {item.quantity}</span>
              </span>
              <span className="tabular-nums text-content">{formatPrice(item.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <h2 className="mb-3 mt-8 text-xs font-medium uppercase tracking-[0.18em] text-content-subtle">
          Shipping to
        </h2>
        <address className="not-italic leading-relaxed text-content">
          {order.shipFullName}<br />
          {order.shipLine1}<br />
          {order.shipLine2 && <>{order.shipLine2}<br /></>}
          {order.shipCity}, {order.shipState} {order.shipPostalCode}<br />
          {order.shipCountry}
        </address>
      </div>

      <aside className="w-full shrink-0 border border-line bg-surface p-7 lg:w-96">
        <h2 className="mb-5 font-heading text-xl font-medium text-content">
          Summary
        </h2>
        <dl className="flex flex-col gap-3 text-sm">
          {/* discountTotal intentionally omitted — out of PRD scope (always 0.00) */}
          <Row label="Subtotal" value={order.subtotal} />
          <Row label="Tax" value={order.taxTotal} />
          <Row label="Shipping" value={order.shippingTotal} />
          <div className="mt-3 border-t border-line pt-4">
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
      <dt className={bold ? 'font-medium text-content' : 'text-content-muted'}>{label}</dt>
      <dd
        className={
          bold
            ? 'font-heading text-lg font-medium tabular-nums text-content'
            : 'tabular-nums text-content'
        }
      >
        {formatPrice(value)}
      </dd>
    </div>
  );
}
