import { describe, it, expect, vi } from 'vitest';
import { createReview } from './api-reviews';
import type { AuthedApiDeps } from './api-authed';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function deps(fetchMock: ReturnType<typeof vi.fn>): AuthedApiDeps {
  return {
    baseUrl: 'http://api.test',
    getAccessToken: () => 'access-token',
    getRefreshToken: () => 'refresh-token',
    onTokensRefreshed: vi.fn(),
    onSessionInvalid: vi.fn(),
    fetch: fetchMock,
  };
}

describe('createReview', () => {
  it('POSTs the review to the product reviews endpoint and returns the created view', async () => {
    const created = {
      id: 'r1',
      rating: 5,
      title: 'Great',
      body: 'Loved it',
      isVerified: true,
      authorName: 'Ada',
      publishedAt: '2026-07-06T00:00:00.000Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, created));
    const result = await createReview(
      'p1',
      { rating: 5, title: 'Great', body: 'Loved it' },
      deps(fetchMock),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/products/p1/reviews');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      rating: 5,
      title: 'Great',
      body: 'Loved it',
    });
    expect(result).toEqual(created);
  });

  it('propagates the ApiAuthError status on a rejected create (e.g. 403)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(403, { message: 'not delivered' }));
    await expect(
      createReview('p1', { rating: 5 }, deps(fetchMock)),
    ).rejects.toMatchObject({ status: 403, message: 'not delivered' });
  });
});
