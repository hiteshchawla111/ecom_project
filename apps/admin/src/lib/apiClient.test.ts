import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { apiClient } from './apiClient';
import { tokenStore } from './tokenStore';
import { SessionExpiredError } from './types';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiClient', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('omits Authorization header when no token is stored', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ ok: true }));
    await apiClient.request('/health');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('attaches Bearer access token', async () => {
    tokenStore.set({ accessToken: 'AT', refreshToken: 'RT' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ ok: true }));
    await apiClient.request('/auth/me');
    const headers = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get('Authorization')).toBe('Bearer AT');
  });

  it('on 401 refreshes once, stores the new pair, and retries', async () => {
    tokenStore.set({ accessToken: 'old', refreshToken: 'oldR' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}, 401)) // original request
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: 'new', refreshToken: 'newR' }), // /auth/refresh
      )
      .mockResolvedValueOnce(jsonResponse({ data: 1 })); // retry
    const result = await apiClient.request<{ data: number }>('/auth/me');
    expect(result).toEqual({ data: 1 });
    expect(tokenStore.get()).toEqual({ accessToken: 'new', refreshToken: 'newR' });
    const retryHeaders = new Headers((fetchMock.mock.calls[2][1] as RequestInit).headers);
    expect(retryHeaders.get('Authorization')).toBe('Bearer new');
  });

  it('clears store and throws SessionExpiredError when refresh fails', async () => {
    tokenStore.set({ accessToken: 'old', refreshToken: 'oldR' });
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}, 401)) // original
      .mockResolvedValueOnce(jsonResponse({}, 401)); // refresh fails
    await expect(apiClient.request('/auth/me')).rejects.toBeInstanceOf(SessionExpiredError);
    expect(tokenStore.get()).toBeNull();
  });

  it('concurrent 401s trigger exactly one /auth/refresh', async () => {
    tokenStore.set({ accessToken: 'old', refreshToken: 'oldR' });
    let refreshed = false;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        refreshed = true;
        return Promise.resolve(jsonResponse({ accessToken: 'new', refreshToken: 'newR' }));
      }
      if (!refreshed) return Promise.resolve(jsonResponse({}, 401));
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    await Promise.all([apiClient.request('/a'), apiClient.request('/b')]);
    const refreshCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).endsWith('/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(1);
  });
});
