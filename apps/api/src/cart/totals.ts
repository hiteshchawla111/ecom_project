/**
 * Pure cart/order totals pipeline — the single authority for
 * subtotal → discounts → taxes → shipping → grand total.
 *
 * No Prisma, no Nest. All math is in integer cents to avoid float drift;
 * money leaves as 2-dp strings to match the API's Decimal-as-string contract.
 * The order-review slice (Phase 4, slice 2) MUST reuse this, not reimplement it.
 */

/** One priced cart line. Caller resolves the effective unit price (sale vs regular). */
export interface TotalsLine {
  unitPriceCents: number;
  quantity: number;
}

/** Pricing rules, pre-parsed to integer cents (see cart.config.ts). */
export interface TotalsConfig {
  taxRate: number;
  shippingFlatCents: number;
  freeShippingThresholdCents: number;
}

/** The five-stage pipeline result, as 2-dp money strings. */
export interface CartTotals {
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  shippingTotal: string;
  grandTotal: string;
}

/** Format integer cents as a 2-dp money string, e.g. 4898 -> "48.98". */
export function centsToString(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = (abs % 100).toString().padStart(2, '0');
  return `${sign}${dollars}.${remainder}`;
}

/** Round half-up to the nearest integer cent. */
function roundCents(value: number): number {
  return Math.round(value);
}

export function computeTotals(
  lines: TotalsLine[],
  config: TotalsConfig,
): CartTotals {
  const subtotal = lines.reduce(
    (sum, line) => sum + line.unitPriceCents * line.quantity,
    0,
  );
  const discountTotal = 0; // Out of PRD scope; present for pipeline completeness.
  const taxTotal = roundCents(subtotal * config.taxRate);
  const shippingTotal =
    subtotal === 0 || subtotal >= config.freeShippingThresholdCents
      ? 0
      : config.shippingFlatCents;
  const grandTotal = subtotal - discountTotal + taxTotal + shippingTotal;

  return {
    subtotal: centsToString(subtotal),
    discountTotal: centsToString(discountTotal),
    taxTotal: centsToString(taxTotal),
    shippingTotal: centsToString(shippingTotal),
    grandTotal: centsToString(grandTotal),
  };
}
