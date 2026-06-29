'use client';

import { useState } from 'react';
import { useCart } from './CartProvider';

/**
 * Adds one of `productId` to the cart. Logged-out → the store routes to /login;
 * a forbidden (e.g. seller) account surfaces the cart error inline. Only shows
 * the "Added" confirmation when the add actually succeeded (no error).
 */
export function AddToCartButton({ productId, disabled }: { productId: string; disabled?: boolean }) {
  const { add, pending, error } = useCart();
  const [added, setAdded] = useState(false);

  async function onClick() {
    await add(productId);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  // A confirmation only counts when the most recent op left no error.
  const showAdded = added && !error;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => void onClick()}
        className="inline-flex w-full items-center justify-center gap-2 bg-content px-6 py-4 text-xs font-medium uppercase tracking-[0.16em] text-surface transition-colors duration-300 hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-40"
      >
        {disabled ? (
          'Unavailable'
        ) : showAdded ? (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
              <path d="m5 13 4 4L19 7" />
            </svg>
            Added to cart
          </>
        ) : pending ? (
          'Adding…'
        ) : (
          'Add to cart'
        )}
      </button>
      {error && (
        <p role="alert" className="text-sm text-error-600">
          {error}
        </p>
      )}
    </div>
  );
}
