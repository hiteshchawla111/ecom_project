import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/session';
import { getCart, liveCartDeps, type CartView } from '@/lib/api-cart';
import { CheckoutView } from '@/components/checkout/CheckoutView';

export const metadata: Metadata = { title: 'Checkout' };

const EMPTY_CART: CartView = {
  id: '',
  items: [],
  totals: { subtotal: '0.00', discountTotal: '0.00', taxTotal: '0.00', shippingTotal: '0.00', grandTotal: '0.00' },
};

export default async function CheckoutPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let cart: CartView;
  try {
    cart = await getCart(await liveCartDeps());
  } catch {
    cart = EMPTY_CART;
  }
  if (cart.items.length === 0) redirect('/cart');

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 pb-24 pt-12">
      <header className="flex flex-col gap-2 border-b border-line pb-8">
        <span className="text-xs font-medium uppercase tracking-[0.28em] text-content-subtle">
          Almost there
        </span>
        <h1 className="font-heading text-4xl font-medium tracking-[-0.01em] text-content sm:text-5xl">
          Checkout
        </h1>
      </header>
      <CheckoutView cart={cart} />
    </main>
  );
}
