import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/session';
import { listOrders, type OrderSummaryRow, type Paginated } from '@/lib/api-orders';
import { liveAuthedDeps } from '@/lib/api-authed';
import { ApiAuthError } from '@/lib/api-auth';
import { formatPrice } from '@/lib/money';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';

export const metadata: Metadata = { title: 'Your orders' };

const dateFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

export default async function OrdersHistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let history: Paginated<OrderSummaryRow>;
  try {
    history = await listOrders(await liveAuthedDeps());
  } catch (err) {
    if (err instanceof ApiAuthError && err.status === 401) redirect('/login');
    throw err;
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 pb-24 pt-12">
      <header className="flex flex-col gap-2 border-b border-line pb-8">
        <span className="text-xs font-medium uppercase tracking-[0.28em] text-content-subtle">
          Order history
        </span>
        <h1 className="font-heading text-4xl font-medium tracking-[-0.01em] text-content sm:text-5xl">
          Your orders
        </h1>
      </header>

      {history.data.length === 0 ? (
        <div className="flex flex-col items-center gap-5 border border-line bg-surface py-24 text-center">
          <p className="font-heading text-2xl font-medium text-content">
            No orders yet.
          </p>
          <p className="max-w-sm text-sm text-content-muted">
            When you place an order, it’ll appear here for tracking.
          </p>
          <Link
            href="/products"
            className="bg-content px-8 py-3.5 text-xs font-medium uppercase tracking-[0.14em] text-surface transition-colors duration-300 hover:bg-primary-600"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {history.data.map((order) => (
            <li key={order.id}>
              <Link
                href={`/orders/${order.id}`}
                className="group flex flex-wrap items-center justify-between gap-4 py-5 transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-heading text-lg font-medium text-content">
                    Order {order.id.slice(-8).toUpperCase()}
                  </span>
                  <span className="text-sm text-content-muted">
                    {dateFmt.format(new Date(order.createdAt))} ·{' '}
                    {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <div className="flex items-center gap-6">
                  <OrderStatusBadge status={order.status} />
                  <span className="font-heading text-lg font-medium tabular-nums text-content">
                    {formatPrice(order.grandTotal)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
