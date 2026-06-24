import { buildPrefixTsQuery } from './build-prefix-tsquery';

describe('buildPrefixTsQuery', () => {
  it('adds a prefix marker to a single token', () => {
    expect(buildPrefixTsQuery('auro')).toBe('auro:*');
  });

  it('ANDs complete tokens and prefixes only the last', () => {
    expect(buildPrefixTsQuery('aurora sma')).toBe('aurora & sma:*');
  });

  it('lowercases and collapses extra whitespace', () => {
    expect(buildPrefixTsQuery('  Aurora   X ')).toBe('aurora & x:*');
  });

  it('splits on non-alphanumerics', () => {
    expect(buildPrefixTsQuery('red-shoes')).toBe('red & shoes:*');
  });

  it('keeps digits (alphanumeric tokens)', () => {
    expect(buildPrefixTsQuery('iphone 15')).toBe('iphone & 15:*');
  });

  it('returns null for empty input', () => {
    expect(buildPrefixTsQuery('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(buildPrefixTsQuery('   ')).toBeNull();
  });

  it('returns null when input has no alphanumeric tokens', () => {
    expect(buildPrefixTsQuery('!!! @# ')).toBeNull();
  });
});
