import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('returns a relative path unchanged', () => {
    expect(safeNext('/sell')).toBe('/sell');
    expect(safeNext('/account/seller')).toBe('/account/seller');
  });
  it('falls back to / for missing or unsafe values', () => {
    expect(safeNext(undefined)).toBe('/');
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext('sell')).toBe('/');
  });
});
