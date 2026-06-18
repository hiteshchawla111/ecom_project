import { describe, it, expect, vi } from 'vitest';
import { authedRequest, type AuthedApiDeps } from './api-authed';
import { ApiAuthError } from './api-auth';

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;
const errResponse = (status: number, body: unknown) =>
  ({ ok: false, status, json: async () => body }) as Response;

const baseDeps = (over: Partial<AuthedApiDeps> = {}): AuthedApiDeps => ({
  baseUrl: 'http://api.test',
  getAccessToken: () => 'access-1',
  getRefreshToken: () => 'refresh-1',
  onTokensRefreshed: vi.fn(),
  onSessionInvalid: vi.fn(),
  fetch: vi.fn(),
  ...over,
});

describe('authedRequest', () => {
  it('sends the bearer token and returns the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ ok: true }));
    const deps = baseDeps({ fetch: fetchMock });
    const res = await authedRequest('/thing', { method: 'GET' }, deps);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/thing',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ authorization: 'Bearer access-1' }),
      }),
    );
    expect(res).toEqual({ ok: true });
  });

  it('refreshes once on 401 then retries with the new token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(okResponse({ ok: true }));
    const onTokensRefreshed = vi.fn();
    const deps = baseDeps({
      fetch: fetchMock,
      onTokensRefreshed,
      refresh: vi.fn().mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2' }),
    });
    await authedRequest('/thing', { method: 'GET' }, deps);
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe('Bearer access-2');
    expect(onTokensRefreshed).toHaveBeenCalledWith({ accessToken: 'access-2', refreshToken: 'refresh-2' });
  });

  it('invalidates the session when refresh fails on 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(401, { message: 'expired' }));
    const onSessionInvalid = vi.fn();
    const deps = baseDeps({
      fetch: fetchMock,
      onSessionInvalid,
      refresh: vi.fn().mockRejectedValue(new ApiAuthError('bad', 401)),
    });
    await expect(authedRequest('/thing', { method: 'GET' }, deps)).rejects.toBeInstanceOf(ApiAuthError);
    expect(onSessionInvalid).toHaveBeenCalled();
  });

  it('surfaces a non-401 retry error honestly without invalidating the session', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(errResponse(500, { message: 'boom' }));
    const onSessionInvalid = vi.fn();
    const deps = baseDeps({
      fetch: fetchMock,
      onSessionInvalid,
      refresh: vi.fn().mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2' }),
    });
    await expect(authedRequest('/thing', { method: 'GET' }, deps)).rejects.toMatchObject({ status: 500 });
    expect(onSessionInvalid).not.toHaveBeenCalled();
  });

  it('flattens an array message from the API error body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(400, { message: ['a', 'b'] }));
    const deps = baseDeps({ fetch: fetchMock, getRefreshToken: () => undefined });
    await expect(authedRequest('/thing', { method: 'GET' }, deps)).rejects.toMatchObject({ status: 400, message: 'a, b' });
  });
});
