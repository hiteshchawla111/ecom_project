/** Route prefixes that require an authenticated customer. */
const PROTECTED_PREFIXES = ['/account'];

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
