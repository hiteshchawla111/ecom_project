import { groupCartLinesBySeller, type SellerLine } from './group-by-seller';
import type { PricingItem } from '../cart/cart-pricing';

const item = (productId: string): PricingItem => ({
  productId,
  quantity: 1,
  product: { name: productId, price: '10.00', salePrice: null },
});

const line = (sellerId: string, sellerName: string, productId: string): SellerLine => ({
  sellerId,
  sellerName,
  item: item(productId),
});

describe('groupCartLinesBySeller', () => {
  it('returns one group for a single-seller cart', () => {
    const groups = groupCartLinesBySeller([
      line('s1', 'Shop One', 'p1'),
      line('s1', 'Shop One', 'p2'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sellerId).toBe('s1');
    expect(groups[0].sellerName).toBe('Shop One');
    expect(groups[0].items.map((i) => i.productId)).toEqual(['p1', 'p2']);
  });

  it('partitions a multi-seller cart into N groups in deterministic (ascending sellerId) order', () => {
    const groups = groupCartLinesBySeller([
      line('s2', 'Shop Two', 'p3'),
      line('s1', 'Shop One', 'p1'),
      line('s2', 'Shop Two', 'p4'),
    ]);
    expect(groups.map((g) => g.sellerId)).toEqual(['s1', 's2']);
    expect(groups[0].items.map((i) => i.productId)).toEqual(['p1']);
    expect(groups[1].items.map((i) => i.productId)).toEqual(['p3', 'p4']);
  });

  it('carries sellerName from the line', () => {
    const groups = groupCartLinesBySeller([line('s1', 'Demo Shop', 'p1')]);
    expect(groups[0].sellerName).toBe('Demo Shop');
  });

  it('throws if a line has no resolvable seller', () => {
    expect(() =>
      groupCartLinesBySeller([line('', 'x', 'p1')]),
    ).toThrow(/seller/i);
  });
});
