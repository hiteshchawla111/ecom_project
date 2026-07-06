import { describe, it, expect, vi } from 'vitest';
import { handleCreateReview, handleListReviews } from './handlers';
import type { ReviewsRouteDeps } from './handlers';
import { ApiAuthError } from '@/lib/api-auth';

function deps(over: Partial<ReviewsRouteDeps> = {}): ReviewsRouteDeps {
  return {
    create: vi.fn(),
    list: vi.fn(),
    ...over,
  };
}

describe('handleCreateReview', () => {
  it('rejects a missing/invalid rating with 400 before calling create', async () => {
    const d = deps();
    const result = await handleCreateReview('p1', {}, d);
    expect(result.status).toBe(400);
    expect(d.create).not.toHaveBeenCalled();
  });

  it('rejects a rating outside 1..5 with 400', async () => {
    const d = deps();
    expect((await handleCreateReview('p1', { rating: 0 }, d)).status).toBe(400);
    expect((await handleCreateReview('p1', { rating: 6 }, d)).status).toBe(400);
  });

  it('returns 201 with the created review on success', async () => {
    const created = {
      id: 'r1',
      rating: 5,
      title: null,
      body: null,
      isVerified: true,
      authorName: 'Ada',
      publishedAt: '2026-07-06T00:00:00.000Z',
    };
    const create = vi.fn().mockResolvedValue(created);
    const result = await handleCreateReview('p1', { rating: 5 }, deps({ create }));
    expect(create).toHaveBeenCalledWith('p1', { rating: 5, title: undefined, body: undefined });
    expect(result).toEqual({ status: 201, body: created });
  });

  it.each([403, 409, 400, 401])(
    'maps an ApiAuthError %i to { status, body: { message } }',
    async (status) => {
      const create = vi.fn().mockRejectedValue(new ApiAuthError('nope', status));
      const result = await handleCreateReview('p1', { rating: 5 }, deps({ create }));
      expect(result).toEqual({ status, body: { message: 'nope' } });
    },
  );

  it('rethrows an unexpected (non-ApiAuthError) error', async () => {
    const create = vi.fn().mockRejectedValue(new Error('kaboom'));
    await expect(
      handleCreateReview('p1', { rating: 5 }, deps({ create })),
    ).rejects.toThrow('kaboom');
  });
});

describe('handleListReviews', () => {
  it('passes cursor + parsed limit through and returns the page', async () => {
    const page = {
      data: [],
      nextCursor: null,
      summary: { ratingAvg: null, ratingCount: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } },
    };
    const list = vi.fn().mockResolvedValue(page);
    const result = await handleListReviews('p1', { cursor: 'c1', limit: '10' }, deps({ list }));
    expect(list).toHaveBeenCalledWith('p1', { cursor: 'c1', limit: 10 });
    expect(result).toEqual({ status: 200, body: page });
  });

  it('degrades an upstream failure to an empty page (200) so the page never breaks', async () => {
    const list = vi.fn().mockRejectedValue(new Error('upstream down'));
    const result = await handleListReviews('p1', {}, deps({ list }));
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ data: [], nextCursor: null });
  });
});
