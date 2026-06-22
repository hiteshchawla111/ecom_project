import { parseOrigins } from './cors';

describe('parseOrigins', () => {
  const DEFAULTS = ['http://localhost:5001', 'http://localhost:5002'];
  it('returns dev defaults when unset', () => {
    expect(parseOrigins(undefined)).toEqual(DEFAULTS);
    expect(parseOrigins('')).toEqual(DEFAULTS);
    expect(parseOrigins('   ')).toEqual(DEFAULTS);
  });
  it('splits a comma-separated list and trims', () => {
    expect(parseOrigins('https://a.com, https://b.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });
  it('drops empty entries', () => {
    expect(parseOrigins('https://a.com,,https://b.com,')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });
  it('drops a wildcard entry (no blanket CORS)', () => {
    expect(parseOrigins('*,https://a.com')).toEqual(['https://a.com']);
  });
});
