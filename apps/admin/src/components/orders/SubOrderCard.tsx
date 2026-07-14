import type { SubOrderStatus, SubOrderView } from '../../lib/sellerSubOrders';
import { nextStatuses, ACTION } from '../../lib/subOrderTransitions';
import { OrderStatusBadge } from './OrderStatusBadge';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (s: string) => usd.format(Number(s));
const dateFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

interface SubOrderCardProps {
  subOrder: SubOrderView;
  busy: boolean;
  error: string | null;
  onTransition: (id: string, next: SubOrderStatus) => void;
}

export function SubOrderCard({ subOrder, busy, error, onTransition }: SubOrderCardProps) {
  const s = subOrder;
  const actions = nextStatuses(s.status);

  return (
    <div className="flex flex-col gap-4 border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <OrderStatusBadge status={s.status} />
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-content-subtle">
            #{s.orderId.slice(-8)}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-content-muted">{dateFmt.format(new Date(s.createdAt))}</span>
          <span className="font-medium tabular-nums text-content">{money(s.grandTotal)}</span>
        </div>
      </div>

      <p className="text-sm text-content-muted">
        Ship to <span className="font-medium text-content">{s.shipFullName}</span>
        {' — '}
        {s.shipCity}, {s.shipState}
      </p>

      <ul className="divide-y divide-line border-y border-line text-sm">
        {s.items.map((it) => (
          <li key={it.productId} className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-content">
              {it.productName}
              <span className="ml-2 text-content-muted">× {it.quantity}</span>
            </span>
            <span className="tabular-nums text-content-muted">{money(it.lineTotal)}</span>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="text-sm text-error-600">
          {error}
        </p>
      ) : null}

      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {actions.map((next) => {
            const a = ACTION[next];
            return (
              <button
                key={next}
                type="button"
                disabled={busy}
                onClick={() => onTransition(s.id, next)}
                className={
                  a.destructive
                    ? 'border border-error-500 px-4 py-2 text-xs font-medium uppercase tracking-[0.12em] text-error-600 transition-colors duration-300 hover:bg-error-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-error-500 disabled:cursor-not-allowed disabled:opacity-50'
                    : 'bg-primary-600 px-4 py-2 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors duration-300 hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:cursor-not-allowed disabled:opacity-50'
                }
              >
                {a.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
