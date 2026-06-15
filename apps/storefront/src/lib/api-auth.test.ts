import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiAuthError,
  confirmReset,
  fetchCurrentUser,
  login,
  logout,
  refresh,
  register,
  requestReset,
} from './api-auth';

const BASE = 'http://api.test';

/** Build a fetch stub that records the last call and returns the given response. */
function stubFetch(
  status: number,
  body: unknown,
): { fetch: typeof fetch; calls: { url: string; init?: RequestInit }[] } {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(body == null ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetch, calls };
}

afterEach(() => vi.restoreAllMocks());

describe('api-auth client', () => {
  it('register POSTs to /auth/register and returns the token pair', async () => {
    const pair = { accessToken: 'a', refreshToken: 'r' };
    const { fetch, calls } = stubFetch(201, pair);

    const result = await register(
      { email: 'A@Test.com', password: 'password123', name: 'Ann' },
      { baseUrl: BASE, fetch },
    );

    expect(result).toEqual(pair);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/auth/register`);
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      email: 'A@Test.com',
      password: 'password123',
      name: 'Ann',
    });
    expect(
      new Headers(calls[0].init?.headers).get('content-type'),
    ).toBe('application/json');
  });

  it('login POSTs to /auth/login and returns the token pair', async () => {
    const pair = { accessToken: 'a', refreshToken: 'r' };
    const { fetch, calls } = stubFetch(200, pair);

    const result = await login(
      { email: 'a@test.com', password: 'password123' },
      { baseUrl: BASE, fetch },
    );

    expect(result).toEqual(pair);
    expect(calls[0].url).toBe(`${BASE}/auth/login`);
  });

  it('refresh POSTs the refresh token and returns a new pair', async () => {
    const pair = { accessToken: 'a2', refreshToken: 'r2' };
    const { fetch, calls } = stubFetch(200, pair);

    const result = await refresh('r1', { baseUrl: BASE, fetch });

    expect(result).toEqual(pair);
    expect(calls[0].url).toBe(`${BASE}/auth/refresh`);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ refreshToken: 'r1' });
  });

  it('logout POSTs the refresh token', async () => {
    const { fetch, calls } = stubFetch(200, { ok: true });

    await logout('r1', { baseUrl: BASE, fetch });

    expect(calls[0].url).toBe(`${BASE}/auth/logout`);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ refreshToken: 'r1' });
  });

  it('fetchCurrentUser GETs /auth/me with a bearer token', async () => {
    const user = { sub: 'u1', email: 'a@test.com', role: 'CUSTOMER' };
    const { fetch, calls } = stubFetch(200, user);

    const result = await fetchCurrentUser('access-token', { baseUrl: BASE, fetch });

    expect(result).toEqual(user);
    expect(calls[0].url).toBe(`${BASE}/auth/me`);
    expect(calls[0].init?.method ?? 'GET').toBe('GET');
    expect(new Headers(calls[0].init?.headers).get('authorization')).toBe(
      'Bearer access-token',
    );
  });

  it('requestReset POSTs the email', async () => {
    const { fetch, calls } = stubFetch(200, { ok: true });
    await requestReset('a@test.com', { baseUrl: BASE, fetch });
    expect(calls[0].url).toBe(`${BASE}/auth/password-reset/request`);
  });

  it('confirmReset POSTs token + password', async () => {
    const { fetch, calls } = stubFetch(200, { ok: true });
    await confirmReset('tok', 'password123', { baseUrl: BASE, fetch });
    expect(calls[0].url).toBe(`${BASE}/auth/password-reset/confirm`);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      token: 'tok',
      password: 'password123',
    });
  });

  it('throws ApiAuthError with status and message on a non-2xx response', async () => {
    const { fetch } = stubFetch(401, { message: 'Invalid credentials' });

    await expect(
      login({ email: 'a@test.com', password: 'nope' }, { baseUrl: BASE, fetch }),
    ).rejects.toMatchObject({
      name: 'ApiAuthError',
      status: 401,
      message: 'Invalid credentials',
    });
  });

  it('flattens array validation messages from the API into one message', async () => {
    const { fetch } = stubFetch(400, {
      message: ['email must be an email', 'password too short'],
    });

    await expect(
      register(
        { email: 'bad', password: 'x', name: 'A' },
        { baseUrl: BASE, fetch },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: 'email must be an email, password too short',
    });
  });

  it('ApiAuthError is an Error subclass', () => {
    const err = new ApiAuthError('boom', 500);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(500);
  });
});
