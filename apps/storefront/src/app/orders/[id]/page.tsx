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
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-neutral-900">Order placed</h1>
        <p className="text-sm text-neutral-600">
          Thank you — your order <span className="font-medium text-neutral-900">{order.id}</span> has been received.
        </p>
      </header>
      <OrderSummary order={order} />
    </main>
  );
}
