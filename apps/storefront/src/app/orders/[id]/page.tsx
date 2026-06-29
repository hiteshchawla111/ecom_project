import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/session';
import { getOrder } from '@/lib/api-orders';
import { liveAuthedDeps } from '@/lib/api-authed';
import { ApiAuthError } from '@/lib/api-auth';
import { OrderSummary } from '@/components/orders/OrderSummary';

export const metadata: Metadata = { title: 'Order confirmation' };

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { id } = await params;

  let order;
  try {
    order = await getOrder(id, await liveAuthedDeps());
  } catch (err) {
    if (err instanceof ApiAuthError && err.status === 404) notFound();
    if (err instanceof ApiAuthError && err.status === 401) redirect('/login');
    throw err;
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 pb-24 pt-12">
      <header className="flex flex-col items-start gap-3 border-b border-line pb-8">
        <span className="flex size-12 items-center justify-center rounded-full bg-success-500/10 text-success-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden="true">
            <path d="m5 13 4 4L19 7" />
          </svg>
        </span>
        <h1 className="font-heading text-4xl font-medium tracking-[-0.01em] text-content sm:text-5xl">
          Order placed
        </h1>
        <p className="text-sm text-content-muted">
          Thank you — order{' '}
          <span className="font-medium tabular-nums text-content">
            {order.id.slice(-8).toUpperCase()}
          </span>{' '}
          has been received. A confirmation is on its way.
        </p>
      </header>
      <OrderSummary order={order} />
    </main>
  );
}
