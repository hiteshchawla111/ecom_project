import { centsToString, type CartTotals } from '../cart/totals';

/** Inverse of centsToString: parse a 2-dp money string to integer cents.
 *  Handles an optional leading '-'. Avoids float math on the whole value. */
export function moneyStringToCents(value: string): number {
  const negative = value.startsWith('-');
  const abs = negative ? value.slice(1) : value;
  const [dollars, cents = '0'] = abs.split('.');
  const total = Number(dollars) * 100 + Number(cents.padEnd(2, '0').slice(0, 2));
  return negative ? -total : total;
}

const FIELDS = [
  'subtotal',
  'discountTotal',
  'taxTotal',
  'shippingTotal',
  'grandTotal',
] as const;

/** Sum per-seller CartTotals into one aggregate, in integer cents (no float
 *  drift), formatting each field back to a 2-dp string. */
export function sumTotals(parts: CartTotals[]): CartTotals {
  const cents: Record<(typeof FIELDS)[number], number> = {
    subtotal: 0,
    discountTotal: 0,
    taxTotal: 0,
    shippingTotal: 0,
    grandTotal: 0,
  };
  for (const part of parts) {
    for (const f of FIELDS) cents[f] += moneyStringToCents(part[f]);
  }
  return {
    subtotal: centsToString(cents.subtotal),
    discountTotal: centsToString(cents.discountTotal),
    taxTotal: centsToString(cents.taxTotal),
    shippingTotal: centsToString(cents.shippingTotal),
    grandTotal: centsToString(cents.grandTotal),
  };
}
