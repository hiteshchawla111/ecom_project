'use client';

import { useState } from 'react';
import { useCart } from './CartProvider';

/** Adds one of `productId` to the cart. Logged-out → the store routes to /login. */
export function AddToCartButton({ productId, disabled }: { productId: string; disabled?: boolean }) {
  const { add, pending } = useCart();
  const [added, setAdded] = useState(false);

  async function onClick() {
    await add(productId);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() => void onClick()}
      className="mt-2 inline-flex w-fit items-center justify-center rounded-md bg-primary-500 px-5 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-50"
    >
      {disabled ? 'Unavailable' : added ? 'Added ✓' : 'Add to cart'}
    </button>
  );
}
