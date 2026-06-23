import { describe, expect, it } from 'vitest';
import { parseTheme, THEME_COOKIE } from './theme';

describe('theme', () => {
  it('exposes a stable cookie name', () => {
    expect(THEME_COOKIE).toBe('sf_theme');
  });

  it('parses a valid stored value', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('light')).toBe('light');
  });

  it('defaults to light for missing or invalid values', () => {
    expect(parseTheme(undefined)).toBe('light');
    expect(parseTheme('')).toBe('light');
    expect(parseTheme('banana')).toBe('light');
  });
});
