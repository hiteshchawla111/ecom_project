import type { PricingItem } from '../cart/cart-pricing';

/** A validated cart line paired with its seller (from product.seller). */
export interface SellerLine {
  sellerId: string;
  sellerName: string;
  item: PricingItem;
}

/** One seller's slice of the cart: the seller + that seller's priced-input items. */
export interface SellerGroup {
  sellerId: string;
  sellerName: string;
  items: PricingItem[];
}

/**
 * Partition validated cart lines by seller into one SellerGroup per distinct
 * sellerId. Deterministic order (ascending sellerId) so output is stable and
 * testable. Throws on a line with no resolvable seller — every Product has a
 * non-null sellerId (M2), so this is a defensive guard, not an expected path.
 */
export function groupCartLinesBySeller(lines: SellerLine[]): SellerGroup[] {
  const bySeller = new Map<string, SellerGroup>();
  for (const line of lines) {
    if (!line.sellerId) {
      throw new Error(
        `Cart line for product '${line.item.productId}' has no resolvable seller.`,
      );
    }
    let group = bySeller.get(line.sellerId);
    if (!group) {
      group = { sellerId: line.sellerId, sellerName: line.sellerName, items: [] };
      bySeller.set(line.sellerId, group);
    }
    group.items.push(line.item);
  }
  return [...bySeller.values()].sort((a, b) =>
    a.sellerId < b.sellerId ? -1 : a.sellerId > b.sellerId ? 1 : 0,
  );
}
