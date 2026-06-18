/** Route prefixes that require an authenticated customer. */
const PROTECTED_PREFIXES = ['/account', '/cart', '/checkout', '/orders'];

export function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Decide whether a request should be redirected to the login page.
 * `hasSession` reflects only cookie presence — the page still verifies the
 * session against the API (defense in depth).
 *
 * @returns the redirect target, or null to proceed.
 */
export function loginRedirectFor(
  pathname: string,
  hasSession: boolean,
): string | null {
  if (isProtected(pathname) && !hasSession) return '/login';
  return null;
}

/** Auth routes a logged-in customer should be bounced away from. */
const AUTH_PREFIXES = ['/login', '/register', '/forgot-password', '/reset-password'];

export function isAuthRoute(pathname: string): boolean {
  return AUTH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Decide whether an authenticated request should be redirected off an auth page.
 * `hasSession` reflects only cookie presence.
 *
 * @returns the redirect target, or null to proceed.
 */
export function guestRedirectFor(
  pathname: string,
  hasSession: boolean,
): string | null {
  if (isAuthRoute(pathname) && hasSession) return '/';
  return null;
}
