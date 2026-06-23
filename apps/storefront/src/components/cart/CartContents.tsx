'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { formatPrice } from '@/lib/money';
import { useCart } from './CartProvider';
import type { CartView } from '@/lib/api-cart';

/** Client cart view, seeded by the server-rendered page via hydrate(). */
export function CartContents({ initial }: { initial: CartView }) {
  const { cart, pending, error, setQuantity, remove, clear, hydrate } = useCart();

  // Load the full SSR cart into the shared store on mount.
  useEffect(() => {
    hydrate(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = cart ?? initial;

  if (view.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-lg text-content-muted">Your cart is empty.</p>
        <Link href="/products" className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-surface hover:bg-primary-600">
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <ul className="flex-1 divide-y divide-line border-y border-line">
        {view.items.map((item) => (
          <li key={item.productId} className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-content">{item.name}</p>
              <p className="text-sm text-content-muted">{formatPrice(item.unitPrice)} each</p>
            </div>
            <div className="flex items-center gap-2" role="group" aria-label={`Quantity for ${item.name}`}>
              <button
                type="button"
                aria-label={`Decrease quantity of ${item.name}`}
                disabled={pending}
                onClick={() => void setQuantity(item.productId, item.quantity - 1)}
                className="h-8 w-8 rounded-md border border-line text-content-muted hover:bg-surface-muted disabled:opacity-50"
              >
                −
              </button>
              <span className="w-8 text-center tabular-nums">{item.quantity}</span>
              <button
                type="button"
                aria-label={`Increase quantity of ${item.name}`}
                disabled={pending}
                onClick={() => void setQuantity(item.productId, item.quantity + 1)}
                className="h-8 w-8 rounded-md border border-line text-content-muted hover:bg-surface-muted disabled:opacity-50"
              >
                +
              </button>
            </div>
            <p className="w-20 text-right font-medium tabular-nums text-content">{formatPrice(item.lineTotal)}</p>
            <button
              type="button"
              aria-label={`Remove ${item.name}`}
              disabled={pending}
              onClick={() => void remove(item.productId)}
              className="text-sm text-error-500 hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <aside className="w-full shrink-0 rounded-lg border border-line bg-surface p-6 lg:w-80">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-content-muted">Order summary</h2>
        <dl className="flex flex-col gap-2 text-sm">
          <Row label="Subtotal" value={view.totals.subtotal} />
          {/* discountTotal intentionally omitted — discounts/coupons are out of PRD scope (always 0.00) */}
          <Row label="Tax" value={view.totals.taxTotal} />
          <Row label="Shipping" value={view.totals.shippingTotal} />
          <div className="mt-2 border-t border-line pt-2">
            <Row label="Total" value={view.totals.grandTotal} bold />
          </div>
        </dl>
        {error && <p className="mt-3 text-sm text-error-500">{error}</p>}
        <Link
          href="/checkout"
          className="mt-6 block rounded-md bg-primary-500 px-4 py-2.5 text-center text-sm font-medium text-surface hover:bg-primary-600"
        >
          Proceed to checkout
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={() => { if (confirm('Clear your cart?')) void clear(); }}
          className="mt-2 block w-full text-center text-sm text-content-muted hover:underline disabled:opacity-50"
        >
          Clear cart
        </button>
      </aside>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className={bold ? 'font-semibold text-content' : 'text-content-muted'}>{label}</dt>
      <dd className={bold ? 'font-semibold text-content' : 'text-content'}>{formatPrice(value)}</dd>
    </div>
  );
}
