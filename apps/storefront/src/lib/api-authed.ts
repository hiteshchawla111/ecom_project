// apps/storefront/src/lib/api-authed.ts
import 'server-only';
import { cookies } from 'next/headers';
import {
  ApiAuthError,
  refresh as apiRefresh,
  type TokenPair,
} from './api-auth';
import { apiBaseUrl } from './env';
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieOptions } from './session';

/** Injectable deps so the authed-fetch + refresh are unit-testable. */
export interface AuthedApiDeps {
  baseUrl: string;
  getAccessToken(): string | undefined;
  getRefreshToken(): string | undefined;
  onTokensRefreshed(pair: TokenPair): void | Promise<void>;
  onSessionInvalid(): void | Promise<void>;
  refresh?(refreshToken: string): Promise<TokenPair>;
  fetch?: typeof fetch;
}

interface ApiErrorBody {
  message?: string | string[];
  error?: string;
}

function messageFrom(body: unknown, status: number): string {
  const b = body as ApiErrorBody | null;
  if (b && Array.isArray(b.message)) return b.message.join(', ');
  if (b && typeof b.message === 'string') return b.message;
  if (b && typeof b.error === 'string') return b.error;
  return `Request failed with status ${status}`;
}

async function callOnce<T>(
  path: string,
  init: RequestInit,
  accessToken: string | undefined,
  deps: AuthedApiDeps,
): Promise<T> {
  const fetchImpl = deps.fetch ?? fetch;
  const res = await fetchImpl(`${deps.baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new ApiAuthError(messageFrom(body, res.status), res.status);
  return body as T;
}

/** Call an API path with the access token; refresh once on 401 and retry.
 *  A non-401 retry error is surfaced unchanged (not masked as 401). */
export async function authedRequest<T>(
  path: string,
  init: RequestInit,
  deps: AuthedApiDeps,
): Promise<T> {
  const accessToken = deps.getAccessToken();
  try {
    return await callOnce<T>(path, init, accessToken, deps);
  } catch (err) {
    if (!(err instanceof ApiAuthError) || err.status !== 401) throw err;
  }

  const refreshToken = deps.getRefreshToken();
  const refreshFn =
    deps.refresh ?? ((t: string) => apiRefresh(t, { baseUrl: deps.baseUrl }));
  if (!refreshToken) {
    await deps.onSessionInvalid();
    throw new ApiAuthError('Session expired', 401);
  }
  let pair: TokenPair;
  try {
    pair = await refreshFn(refreshToken);
  } catch {
    await deps.onSessionInvalid();
    throw new ApiAuthError('Session expired', 401);
  }

  await deps.onTokensRefreshed(pair);

  try {
    return await callOnce<T>(path, init, pair.accessToken, deps);
  } catch (retryErr) {
    if (retryErr instanceof ApiAuthError && retryErr.status === 401) {
      await deps.onSessionInvalid();
      throw new ApiAuthError('Session expired', 401);
    }
    throw retryErr;
  }
}

/** Build live deps bound to cookies() + apiBaseUrl (Server Components / handlers). */
export async function liveAuthedDeps(): Promise<AuthedApiDeps> {
  const store = await cookies();
  const isProd = process.env.NODE_ENV === 'production';
  return {
    baseUrl: apiBaseUrl(),
    getAccessToken: () => store.get(ACCESS_COOKIE)?.value,
    getRefreshToken: () => store.get(REFRESH_COOKIE)?.value,
    onTokensRefreshed: (pair) => {
      store.set(ACCESS_COOKIE, pair.accessToken, cookieOptions(isProd));
      store.set(REFRESH_COOKIE, pair.refreshToken, cookieOptions(isProd));
    },
    onSessionInvalid: () => {
      store.delete(ACCESS_COOKIE);
      store.delete(REFRESH_COOKIE);
    },
  };
}
