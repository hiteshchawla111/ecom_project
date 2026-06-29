/**
 * Display-only money helpers. The API is the single source of truth for all
 * monetary values (CLAUDE.md: "never compute prices/totals client-side").
 * These format strings the API already produced — they never do arithmetic
 * on totals, only present a value and compare regular vs sale for styling.
 */

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/** Format an API price string (Decimal-as-string) as USD, e.g. "$799.00". */
export function formatPrice(value: string): string {
  return usd.format(Number(value));
}

/** True when a sale price exists and is strictly below the regular price. */
export function isOnSale(price: string, salePrice: string | null): boolean {
  if (salePrice === null) return false;
  return Number(salePrice) < Number(price);
}

/**
 * Display-only discount badge percent (rounded), derived from the two prices
 * the API already produced — like {@link isOnSale}, this compares values for
 * presentation; it does not compute any payable amount. Returns null when not
 * on sale or the regular price is zero.
 */
export function discountPercent(
  price: string,
  salePrice: string | null,
): number | null {
  if (!isOnSale(price, salePrice)) return null;
  const regular = Number(price);
  if (!(regular > 0)) return null;
  return Math.round((1 - Number(salePrice) / regular) * 100);
}
