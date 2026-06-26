import { describe, expect, it, vi } from 'vitest';
import { getSellerMe, registerSeller, updateSellerMe } from './seller-api';
import type { AuthedApiDeps } from './api-authed';

function makeAuthedDeps(fetchMock: ReturnType<typeof vi.fn>): AuthedApiDeps {
  return {
    baseUrl: 'http://api',
    getAccessToken: () => 'tok',
    getRefreshToken: () => 'ref',
    onTokensRefreshed: () => {},
    onSessionInvalid: () => {},
    fetch: fetchMock as unknown as typeof fetch,
  };
}

describe('registerSeller', () => {
  it('POSTs to /seller/register with bearer token and returns the view', async () => {
    const view = { id: 's1', displayName: 'Shop', status: 'PENDING_REVIEW' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => view,
    });
    const result = await registerSeller(
      { displayName: 'Shop' },
      { baseUrl: 'http://api', accessToken: 'tok', fetch: fetchMock as unknown as typeof fetch },
    );
    expect(result).toEqual(view);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api/seller/register');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });
});

describe('getSellerMe', () => {
  it('GETs /seller/me with bearer token and returns the view', async () => {
    const view = { id: 's1', displayName: 'Shop', status: 'ACTIVE' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => view });
    const result = await getSellerMe(makeAuthedDeps(fetchMock));
    expect(result).toEqual(view);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api/seller/me');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });
});

describe('updateSellerMe', () => {
  it('PATCHes /seller/me with bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 's1' }) });
    await updateSellerMe({ pan: 'ABCDE1234F' }, makeAuthedDeps(fetchMock));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api/seller/me');
    expect(init.method).toBe('PATCH');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });
});
