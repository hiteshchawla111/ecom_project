import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/session';
import { getCart, liveCartDeps } from '@/lib/api-cart';
import { CartContents } from '@/components/cart/CartContents';

export const metadata: Metadata = { title: 'Cart' };

export default async function CartPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const cart = await getCart(await liveCartDeps());

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">Your cart</h1>
      <CartContents initial={cart} />
    </main>
  );
}
