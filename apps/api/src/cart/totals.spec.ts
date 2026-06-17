import { computeTotals, centsToString, TotalsConfig } from './totals';

const config: TotalsConfig = {
  taxRate: 0.1,
  shippingFlatCents: 500,
  freeShippingThresholdCents: 5000,
};

describe('centsToString', () => {
  it('formats integer cents as a 2-dp string', () => {
    expect(centsToString(0)).toBe('0.00');
    expect(centsToString(4)).toBe('0.04');
    expect(centsToString(1999)).toBe('19.99');
    expect(centsToString(4898)).toBe('48.98');
  });
});

describe('computeTotals', () => {
  it('returns all-zero totals (and zero shipping) for an empty cart', () => {
    expect(computeTotals([], config)).toEqual({
      subtotal: '0.00',
      discountTotal: '0.00',
      taxTotal: '0.00',
      shippingTotal: '0.00',
      grandTotal: '0.00',
    });
  });

  it('sums a single line below the free-shipping threshold and applies flat shipping', () => {
    // 1999 * 2 = 3998 subtotal; tax 399.8 -> 400; shipping 500; grand 4898
    const res = computeTotals([{ unitPriceCents: 1999, quantity: 2 }], config);
    expect(res).toEqual({
      subtotal: '39.98',
      discountTotal: '0.00',
      taxTotal: '4.00',
      shippingTotal: '5.00',
      grandTotal: '48.98',
    });
  });

  it('sums multiple lines', () => {
    const res = computeTotals(
      [
        { unitPriceCents: 1000, quantity: 1 },
        { unitPriceCents: 250, quantity: 3 },
      ],
      config,
    );
    expect(res.subtotal).toBe('17.50'); // 1000 + 750
  });

  it('rounds tax half-up to the nearest cent', () => {
    // subtotal 1005; tax 100.5 -> 101
    const res = computeTotals([{ unitPriceCents: 1005, quantity: 1 }], config);
    expect(res.taxTotal).toBe('1.01');
  });

  it('charges flat shipping just below the threshold', () => {
    const res = computeTotals([{ unitPriceCents: 4999, quantity: 1 }], config);
    expect(res.shippingTotal).toBe('5.00');
  });

  it('gives free shipping exactly at the threshold', () => {
    const res = computeTotals([{ unitPriceCents: 5000, quantity: 1 }], config);
    expect(res.shippingTotal).toBe('0.00');
  });

  it('gives free shipping above the threshold', () => {
    const res = computeTotals([{ unitPriceCents: 6000, quantity: 1 }], config);
    expect(res.shippingTotal).toBe('0.00');
  });

  it('computes grandTotal = subtotal - discount + tax + shipping', () => {
    const res = computeTotals([{ unitPriceCents: 1999, quantity: 2 }], config);
    // 3998 - 0 + 400 + 500 = 4898
    expect(res.grandTotal).toBe('48.98');
  });
});
