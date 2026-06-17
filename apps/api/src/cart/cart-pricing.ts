/**
 * Shared cart/order pricing — the single authority for resolving effective
 * unit prices and building priced lines + totals. Pure (no Prisma, no Nest):
 * callers pass already-loaded rows. Both CartService (cart view) and
 * OrdersService (order snapshot) use this so their numbers can never diverge.
 */
import {
  CartTotals,
  TotalsConfig,
  TotalsLine,
  centsToString,
  computeTotals,
} from './totals';

/** Minimal product fields the pricer needs (a subset of the Prisma row). */
export interface PricingProduct {
  name: string;
  price: string; // Decimal as string
  salePrice: string | null;
}

/** A line to price: quantity + the product's pricing fields. */
export interface PricingItem {
  productId: string;
  quantity: number;
  product: PricingProduct;
  imageUrl?: string | null;
}

/** A priced line: effective unit price + line total as 2-dp strings. */
export interface PricedLine {
  productId: string;
  name: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  imageUrl: string | null;
}

export interface PricedResult {
  lines: PricedLine[];
  totals: CartTotals;
}

/** Effective unit price in integer cents: sale price when strictly below regular. */
export function effectiveUnitCents(
  price: string,
  salePrice: string | null,
): number {
  const regular = Math.round(Number(price) * 100);
  if (salePrice === null) return regular;
  const sale = Math.round(Number(salePrice) * 100);
  return sale < regular ? sale : regular;
}

/** Build priced lines and run the totals pipeline. */
export function priceItems(
  items: PricingItem[],
  config: TotalsConfig,
): PricedResult {
  const lines: PricedLine[] = [];
  const totalsLines: TotalsLine[] = [];

  for (const item of items) {
    const unitCents = effectiveUnitCents(
      item.product.price,
      item.product.salePrice,
    );
    const lineCents = unitCents * item.quantity;
    totalsLines.push({ unitPriceCents: unitCents, quantity: item.quantity });
    lines.push({
      productId: item.productId,
      name: item.product.name,
      unitPrice: centsToString(unitCents),
      quantity: item.quantity,
      lineTotal: centsToString(lineCents),
      imageUrl: item.imageUrl ?? null,
    });
  }

  return { lines, totals: computeTotals(totalsLines, config) };
}
