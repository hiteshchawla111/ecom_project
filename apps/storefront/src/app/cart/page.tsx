import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/session';
import { getCart, liveCartDeps, type CartView } from '@/lib/api-cart';
import { CartContents } from '@/components/cart/CartContents';

export const metadata: Metadata = { title: 'Cart' };

/** Empty cart shown when the SSR fetch can't resolve (e.g. a token refresh
 *  during render, which can't write cookies). The client store re-fetches
 *  authoritatively on first interaction; a real session expiry surfaces as a
 *  401 there and redirects to /login. */
const EMPTY_CART: CartView = {
  id: '',
  items: [],
  totals: {
    subtotal: '0.00',
    discountTotal: '0.00',
    taxTotal: '0.00',
    shippingTotal: '0.00',
    grandTotal: '0.00',
  },
};

export default async function CartPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let cart: CartView;
  try {
    cart = await getCart(await liveCartDeps());
  } catch {
    cart = EMPTY_CART;
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold text-content">Your cart</h1>
      <CartContents initial={cart} />
    </main>
  );
}
