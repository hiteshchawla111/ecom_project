import { effectiveUnitCents, priceItems, PricingItem } from './cart-pricing';
import { TotalsConfig } from './totals';

const config: TotalsConfig = {
  taxRate: 0.1,
  shippingFlatCents: 500,
  freeShippingThresholdCents: 5000,
};

const item = (over: Partial<PricingItem> = {}): PricingItem => ({
  productId: 'p1',
  quantity: 1,
  product: { name: 'Mouse', price: '19.99', salePrice: null },
  imageUrl: null,
  ...over,
});

describe('effectiveUnitCents', () => {
  it('uses the regular price when there is no sale', () => {
    expect(effectiveUnitCents('19.99', null)).toBe(1999);
  });
  it('uses the sale price when strictly below regular', () => {
    expect(effectiveUnitCents('19.99', '9.99')).toBe(999);
  });
  it('uses the regular price when sale is not below regular', () => {
    expect(effectiveUnitCents('19.99', '25.00')).toBe(1999);
  });
  it('uses a $0.00 sale price (Decimal-0 not coerced to null)', () => {
    expect(effectiveUnitCents('19.99', '0.00')).toBe(0);
  });
});

describe('priceItems', () => {
  it('returns zero totals for no items', () => {
    const res = priceItems([], config);
    expect(res.lines).toEqual([]);
    expect(res.totals.grandTotal).toBe('0.00');
  });

  it('builds priced lines and totals (sale price applied, below threshold)', () => {
    const res = priceItems(
      [
        item({
          quantity: 2,
          product: { name: 'Mouse', price: '19.99', salePrice: '9.99' },
          imageUrl: 'http://img/m.jpg',
        }),
      ],
      config,
    );
    expect(res.lines).toEqual([
      {
        productId: 'p1',
        name: 'Mouse',
        unitPrice: '9.99',
        quantity: 2,
        lineTotal: '19.98',
        imageUrl: 'http://img/m.jpg',
      },
    ]);
    // subtotal 1998; tax 200; shipping 500; grand 2698
    expect(res.totals).toEqual({
      subtotal: '19.98',
      discountTotal: '0.00',
      taxTotal: '2.00',
      shippingTotal: '5.00',
      grandTotal: '26.98',
    });
  });

  it('sums multiple lines into the subtotal', () => {
    const res = priceItems(
      [
        item({
          productId: 'a',
          quantity: 1,
          product: { name: 'A', price: '10.00', salePrice: null },
        }),
        item({
          productId: 'b',
          quantity: 3,
          product: { name: 'B', price: '2.50', salePrice: null },
        }),
      ],
      config,
    );
    expect(res.totals.subtotal).toBe('17.50');
  });

  it('defaults imageUrl to null when omitted', () => {
    const res = priceItems(
      [
        {
          productId: 'p1',
          quantity: 1,
          product: { name: 'X', price: '5.00', salePrice: null },
        },
      ],
      config,
    );
    expect(res.lines[0].imageUrl).toBeNull();
  });
});
