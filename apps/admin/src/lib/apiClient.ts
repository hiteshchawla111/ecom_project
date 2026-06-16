import { API_BASE_URL } from './config';
import { tokenStore } from './tokenStore';
import { ApiError, SessionExpiredError, type TokenPair } from './types';

/** Shared in-flight refresh so concurrent 401s only refresh once. */
let refreshInFlight: Promise<TokenPair> | null = null;

async function doRefresh(): Promise<TokenPair> {
  const current = tokenStore.get();
  if (!current) throw new SessionExpiredError();
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: current.refreshToken }),
  });
  if (!res.ok) {
    tokenStore.clear();
    throw new SessionExpiredError();
  }
  const pair = (await res.json()) as TokenPair;
  tokenStore.set(pair);
  return pair;
}

function refreshOnce(): Promise<TokenPair> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function buildHeaders(accessToken: string | undefined, init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return headers;
}

async function rawFetch(path: string, init: RequestInit | undefined, token?: string) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: buildHeaders(token, init),
  });
}

export const apiClient = {
  async request<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    const tokens = tokenStore.get();
    let res = await rawFetch(path, init, tokens?.accessToken);

    if (res.status === 401 && tokens) {
      const refreshed = await refreshOnce(); // throws SessionExpiredError if it fails
      res = await rawFetch(path, init, refreshed.accessToken);
    }

    if (!res.ok) {
      throw new ApiError(res.status, `Request to ${path} failed (${res.status})`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  },
};
