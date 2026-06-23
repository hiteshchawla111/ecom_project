'use client';

import { useContext } from 'react';
import { CartContext } from './CartProvider';

/** Small badge over the header cart icon; hidden when the cart is empty. */
export function CartCountBadge() {
  const ctx = useContext(CartContext);
  const itemCount = ctx?.itemCount ?? 0;
  if (itemCount <= 0) return null;
  return (
    <span
      data-testid="cart-count"
      aria-label={`${itemCount} item${itemCount === 1 ? '' : 's'} in cart`}
      className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary-500 px-1.5 text-xs font-semibold text-surface"
    >
      {itemCount}
    </span>
  );
}
