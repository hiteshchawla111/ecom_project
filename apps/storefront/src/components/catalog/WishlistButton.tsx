'use client';

import { useState, type MouseEvent } from 'react';

/**
 * Save-to-wishlist affordance on a product card. Visual only — wishlist is out
 * of PRD scope, so this toggles local state and does not persist or call any
 * API. It stops click propagation so tapping the heart never triggers the
 * card's product-link navigation.
 */
export function WishlistButton({ productName }: { productName: string }) {
  const [saved, setSaved] = useState(false);

  function toggle(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSaved((s) => !s);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${productName} from wishlist` : `Save ${productName} to wishlist`}
      className="flex size-9 items-center justify-center bg-surface/90 text-content backdrop-blur transition-colors duration-200 hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
    >
      <svg
        viewBox="0 0 24 24"
        strokeWidth="1.6"
        stroke="currentColor"
        fill={saved ? 'currentColor' : 'none'}
        className={saved ? 'size-4 text-primary-600' : 'size-4'}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 21s-7.5-4.6-10-9.1C.4 8.6 2 5 5.5 5c2 0 3.4 1.1 4.5 2.6C11.1 6.1 12.5 5 14.5 5 18 5 19.6 8.6 22 11.9 19.5 16.4 12 21 12 21z"
        />
      </svg>
    </button>
  );
}
