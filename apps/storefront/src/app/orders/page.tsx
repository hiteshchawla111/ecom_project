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
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-neutral-900">Your orders</h1>
      </header>

      {history.data.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-neutral-200 p-8">
          <p className="text-neutral-600">You haven&apos;t placed any orders yet.</p>
          <Link
            href="/products"
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600"
          >
            Browse products
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {history.data.map((order) => (
            <li key={order.id}>
              <Link
                href={`/orders/${order.id}`}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-neutral-200 p-4 transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-neutral-900">
                    Order {order.id}
                  </span>
                  <span className="text-sm text-neutral-600">
                    {dateFmt.format(new Date(order.createdAt))} ·{' '}
                    {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <OrderStatusBadge status={order.status} />
                  <span className="text-sm font-semibold text-neutral-900">
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
