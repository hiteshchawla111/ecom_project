'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { formatPrice } from '@/lib/money';
import { placeholderImage } from '@/components/catalog/product-image';
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
      <div className="flex flex-col items-center gap-5 border border-line bg-surface py-24 text-center">
        <p className="font-heading text-2xl font-medium text-content">
          Your cart is empty.
        </p>
        <p className="max-w-sm text-sm text-content-muted">
          Browse the catalog and add a few things you love.
        </p>
        <Link
          href="/products"
          className="bg-content px-8 py-3.5 text-xs font-medium uppercase tracking-[0.14em] text-surface transition-colors duration-300 hover:bg-primary-600"
        >
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">
      <ul className="flex-1 divide-y divide-line border-y border-line">
        {view.items.map((item) => (
          <li key={item.productId} className="flex items-center gap-4 py-6 sm:gap-6">
            <Link
              href={`/products/${item.productId}`}
              className="shrink-0 overflow-hidden border border-line bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={placeholderImage(item.productId)}
                alt=""
                aria-hidden="true"
                className="size-20 object-cover sm:size-24"
              />
            </Link>

            <div className="min-w-0 flex-1">
              <Link
                href={`/products/${item.productId}`}
                className="block truncate font-heading text-lg font-medium text-content hover:underline"
              >
                {item.name}
              </Link>
              <p className="mt-0.5 text-sm tabular-nums text-content-muted">
                {formatPrice(item.unitPrice)}
              </p>
              <button
                type="button"
                aria-label={`Remove ${item.name}`}
                disabled={pending}
                onClick={() => void remove(item.productId)}
                className="mt-2 text-xs font-medium uppercase tracking-[0.1em] text-content-subtle transition-colors hover:text-error-600 disabled:opacity-50"
              >
                Remove
              </button>
            </div>

            <div
              className="flex items-center border border-line"
              role="group"
              aria-label={`Quantity for ${item.name}`}
            >
              <button
                type="button"
                aria-label={`Decrease quantity of ${item.name}`}
                disabled={pending}
                onClick={() => void setQuantity(item.productId, item.quantity - 1)}
                className="flex size-10 items-center justify-center text-content-muted transition-colors hover:bg-surface-muted hover:text-content disabled:opacity-40"
              >
                −
              </button>
              <span className="w-10 text-center text-sm tabular-nums">
                {item.quantity}
              </span>
              <button
                type="button"
                aria-label={`Increase quantity of ${item.name}`}
                disabled={pending}
                onClick={() => void setQuantity(item.productId, item.quantity + 1)}
                className="flex size-10 items-center justify-center text-content-muted transition-colors hover:bg-surface-muted hover:text-content disabled:opacity-40"
              >
                +
              </button>
            </div>

            <p className="w-24 text-right font-heading text-lg font-medium tabular-nums text-content">
              {formatPrice(item.lineTotal)}
            </p>
          </li>
        ))}
      </ul>

      <aside className="w-full shrink-0 border border-line bg-surface p-7 lg:w-96 lg:sticky lg:top-[calc(var(--header-h)+2rem)]">
        <h2 className="mb-5 font-heading text-xl font-medium text-content">
          Order summary
        </h2>
        <dl className="flex flex-col gap-3 text-sm">
          <Row label="Subtotal" value={view.totals.subtotal} />
          {/* discountTotal intentionally omitted — discounts/coupons are out of PRD scope (always 0.00) */}
          <Row label="Tax" value={view.totals.taxTotal} />
          <Row label="Shipping" value={view.totals.shippingTotal} />
          <div className="mt-3 border-t border-line pt-4">
            <Row label="Total" value={view.totals.grandTotal} bold />
          </div>
        </dl>
        {error && <p className="mt-3 text-sm text-error-600">{error}</p>}
        <Link
          href="/checkout"
          className="mt-6 block bg-content py-4 text-center text-xs font-medium uppercase tracking-[0.16em] text-surface transition-colors duration-300 hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
        >
          Proceed to checkout
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={() => { if (confirm('Clear your cart?')) void clear(); }}
          className="mt-3 block w-full text-center text-xs font-medium uppercase tracking-[0.1em] text-content-subtle transition-colors hover:text-content disabled:opacity-50"
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
      <dt className={bold ? 'font-medium text-content' : 'text-content-muted'}>{label}</dt>
      <dd
        className={
          bold
            ? 'font-heading text-lg font-medium tabular-nums text-content'
            : 'tabular-nums text-content'
        }
      >
        {formatPrice(value)}
      </dd>
    </div>
  );
}
