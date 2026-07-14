import { sumTotals, moneyStringToCents } from './sum-totals';
import type { CartTotals } from '../cart/totals';

const t = (
  subtotal: string,
  discountTotal: string,
  taxTotal: string,
  shippingTotal: string,
  grandTotal: string,
): CartTotals => ({ subtotal, discountTotal, taxTotal, shippingTotal, grandTotal });

describe('moneyStringToCents', () => {
  it('parses 2-dp money strings to integer cents', () => {
    expect(moneyStringToCents('48.98')).toBe(4898);
    expect(moneyStringToCents('10.00')).toBe(1000);
    expect(moneyStringToCents('0.00')).toBe(0);
    expect(moneyStringToCents('100.05')).toBe(10005);
  });
});

describe('sumTotals', () => {
  it('sums each field across parts and formats as 2-dp strings', () => {
    const a = t('48.98', '0.00', '4.90', '5.00', '58.88');
    const b = t('10.00', '0.00', '1.00', '5.00', '16.00');
    expect(sumTotals([a, b])).toEqual(
      t('58.98', '0.00', '5.90', '10.00', '74.88'),
    );
  });

  it('sums shipping per part (two flat-shipping groups do NOT dedupe)', () => {
    const a = t('20.00', '0.00', '2.00', '5.00', '27.00');
    const b = t('20.00', '0.00', '2.00', '5.00', '27.00');
    expect(sumTotals([a, b]).shippingTotal).toBe('10.00');
    expect(sumTotals([a, b]).grandTotal).toBe('54.00');
  });

  it('returns all-zero totals for an empty parts array', () => {
    expect(sumTotals([])).toEqual(t('0.00', '0.00', '0.00', '0.00', '0.00'));
  });

  it('is exact with no float drift on values that sum across a dollar boundary', () => {
    const a = t('0.99', '0.00', '0.00', '0.00', '0.99');
    const b = t('0.02', '0.00', '0.00', '0.00', '0.02');
    expect(sumTotals([a, b]).grandTotal).toBe('1.01');
  });
});
