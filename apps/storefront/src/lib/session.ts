import 'server-only';
import { cookies } from 'next/headers';
import {
  ApiAuthError,
  fetchCurrentUser as apiFetchCurrentUser,
  refresh as apiRefresh,
  type CurrentUser,
  type TokenPair,
} from './api-auth';
import { apiBaseUrl } from './env';

/** httpOnly cookie names holding the session tokens. */
export const ACCESS_COOKIE = 'sf_access';
export const REFRESH_COOKIE = 'sf_refresh';

/** The slice of Next's cookie store this module needs (keeps logic testable). */
export interface CookieStore {
  get(name: string): { name: string; value: string } | undefined;
  set(name: string, value: string): void;
  delete(name: string): void;
}

/** Dependencies injected into the pure session resolver for testability. */
export interface SessionDeps {
  fetchCurrentUser(accessToken: string): Promise<CurrentUser>;
  refresh(refreshToken: string): Promise<TokenPair>;
}

/** Cookie flags — `secure` only in production (dev runs over http). */
export function cookieOptions(isProd: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProd,
    path: '/',
  };
}

function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiAuthError && err.status === 401;
}

/**
 * Resolve the current user from cookies, transparently refreshing an expired
 * access token. Pure over an injected cookie store + deps. Returns null when
 * unauthenticated; clears cookies if the refresh path also fails.
 */
export async function resolveSession(
  store: CookieStore,
  deps: SessionDeps,
): Promise<CurrentUser | null> {
  const accessToken = store.get(ACCESS_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (accessToken) {
    try {
      return await deps.fetchCurrentUser(accessToken);
    } catch (err) {
      if (!isUnauthorized(err)) throw err; // surface real (e.g. 500) failures
      // fall through to refresh
    }
  }

  if (!refreshToken) return null;

  try {
    const pair = await deps.refresh(refreshToken);
    // Persist the rotated tokens. In a Server Component *render* Next forbids
    // cookie writes; that must not abort session resolution (a Route Handler /
    // proxy will re-persist on the next request), so the write is best-effort.
    persistTokens(store, pair);
    return await deps.fetchCurrentUser(pair.accessToken);
  } catch {
    clearTokens(store);
    return null;
  }
}

/** Best-effort token write — ignores the "can't modify cookies during render"
 *  error so session resolution still succeeds in a Server Component. */
function persistTokens(store: CookieStore, pair: TokenPair): void {
  try {
    store.set(ACCESS_COOKIE, pair.accessToken);
    store.set(REFRESH_COOKIE, pair.refreshToken);
  } catch {
    // Read-only (render) context — skip persistence.
  }
}

/** Best-effort cookie clear — ignores the render-context write restriction. */
function clearTokens(store: CookieStore): void {
  try {
    store.delete(ACCESS_COOKIE);
    store.delete(REFRESH_COOKIE);
  } catch {
    // Read-only (render) context — skip clearing.
  }
}

/** Build the production-aware deps bound to the configured API base URL. */
function liveDeps(): SessionDeps {
  const baseUrl = apiBaseUrl();
  return {
    fetchCurrentUser: (token) => apiFetchCurrentUser(token, { baseUrl }),
    refresh: (token) => apiRefresh(token, { baseUrl }),
  };
}

/** Read the current customer (Server Components / Route Handlers). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  return resolveSession(store, liveDeps());
}

/** Persist a fresh token pair as httpOnly cookies. */
export async function setSession(pair: TokenPair): Promise<void> {
  const store = await cookies();
  const opts = cookieOptions(process.env.NODE_ENV === 'production');
  store.set(ACCESS_COOKIE, pair.accessToken, opts);
  store.set(REFRESH_COOKIE, pair.refreshToken, opts);
}

/** Remove the session cookies. */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}
