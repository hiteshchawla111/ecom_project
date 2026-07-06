import { describe, it, expect, vi } from 'vitest';
import { listReviews, type ReviewPage } from './reviews';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const PAGE: ReviewPage = {
  data: [
    {
      id: 'r1',
      rating: 5,
      title: 'Great',
      body: 'Loved it',
      isVerified: true,
      authorName: 'Ada',
      publishedAt: '2026-07-01T00:00:00.000Z',
    },
  ],
  nextCursor: '2026-07-01T00:00:00.000Z_r1',
  summary: {
    ratingAvg: '4.00',
    ratingCount: 3,
    distribution: { '1': 0, '2': 0, '3': 1, '4': 0, '5': 2 },
  },
};

describe('listReviews', () => {
  it('requests the product reviews endpoint with cursor + limit and returns the page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, PAGE));
    const result = await listReviews(
      'p1',
      { cursor: 'c1', limit: 10 },
      { baseUrl: 'http://api.test', fetch: fetchMock },
    );
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('http://api.test/products/p1/reviews');
    expect(url).toContain('cursor=c1');
    expect(url).toContain('limit=10');
    expect(result).toEqual(PAGE);
  });

  it('omits undefined query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, PAGE));
    await listReviews('p1', {}, { baseUrl: 'http://api.test', fetch: fetchMock });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe('http://api.test/products/p1/reviews');
  });

  it('throws ReviewsError with the status on a non-OK response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { message: 'boom' }));
    await expect(
      listReviews('p1', {}, { baseUrl: 'http://api.test', fetch: fetchMock }),
    ).rejects.toMatchObject({ status: 500, message: 'boom' });
  });
});
