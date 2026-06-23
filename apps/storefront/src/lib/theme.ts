export type Theme = 'light' | 'dark';

/**
 * Non-httpOnly cookie holding the theme preference. Readable by the client
 * toggle (document.cookie) and on the server (next/headers) so the root layout
 * can set <html data-theme> before paint — no flash of the wrong theme.
 */
export const THEME_COOKIE = 'sf_theme';

/** Coerce any stored cookie value to a valid Theme; default light. */
export function parseTheme(value: string | undefined): Theme {
  return value === 'dark' ? 'dark' : 'light';
}
