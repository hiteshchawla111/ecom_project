'use client';

import { useState } from 'react';
import { THEME_COOKIE, type Theme } from '@/lib/theme';

/** One year, in seconds — the theme cookie should outlive the session. */
const ONE_YEAR = 60 * 60 * 24 * 365;

/** Read the current theme from the server-rendered <html data-theme>. */
function initialTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'dark'
    : 'light';
}

/**
 * Light/dark toggle for the storefront. The server already set
 * <html data-theme> from the cookie (no flash), so this lazily initializes from
 * that attribute, then on click flips the attribute and persists a
 * non-httpOnly cookie the server reads on the next request. Labels itself by
 * the action it performs.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    document.cookie = `${THEME_COOKIE}=${next}; max-age=${ONE_YEAR}; path=/; samesite=lax`;
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-content-muted transition-colors hover:bg-surface-muted hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
    >
      <span aria-hidden="true">{isDark ? '☀' : '☾'}</span>
    </button>
  );
}
