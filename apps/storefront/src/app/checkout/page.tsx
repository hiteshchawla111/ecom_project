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
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold text-content">Checkout</h1>
      <CheckoutView cart={cart} />
    </main>
  );
}
