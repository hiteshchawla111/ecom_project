import { describe, expect, it } from 'vitest';
import { formatPrice, isOnSale, discountPercent } from './money';

describe('formatPrice', () => {
  it('formats a whole-number string as USD currency', () => {
    expect(formatPrice('799')).toBe('$799.00');
  });

  it('formats a decimal string with two fraction digits', () => {
    expect(formatPrice('12.5')).toBe('$12.50');
  });

  it('handles zero', () => {
    expect(formatPrice('0')).toBe('$0.00');
  });
});

describe('isOnSale', () => {
  it('is true when a sale price is below the regular price', () => {
    expect(isOnSale('799', '699')).toBe(true);
  });

  it('is false when there is no sale price', () => {
    expect(isOnSale('799', null)).toBe(false);
  });

  it('is false when the sale price is not below the regular price', () => {
    expect(isOnSale('799', '799')).toBe(false);
    expect(isOnSale('799', '900')).toBe(false);
  });
});

describe('discountPercent', () => {
  it('rounds the percentage off when on sale', () => {
    expect(discountPercent('100', '75')).toBe(25);
    expect(discountPercent('150', '140')).toBe(7); // 6.67 → 7
  });

  it('returns null when not on sale', () => {
    expect(discountPercent('100', null)).toBeNull();
    expect(discountPercent('100', '100')).toBeNull();
  });

  it('returns null when the regular price is zero', () => {
    expect(discountPercent('0', '0')).toBeNull();
  });
});
