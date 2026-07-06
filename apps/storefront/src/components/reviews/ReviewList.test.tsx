import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReviewList } from './ReviewList';
import type { ReviewPage } from '@/lib/reviews';

function review(id: string, rating = 5, authorName = 'Ada'): ReviewPage['data'][number] {
  return {
    id,
    rating,
    title: `Title ${id}`,
    body: `Body ${id}`,
    isVerified: true,
    authorName,
    publishedAt: '2026-07-01T00:00:00.000Z',
  };
}

const SUMMARY: ReviewPage['summary'] = {
  ratingAvg: '5.00',
  ratingCount: 2,
  distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 2 },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ReviewList', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders the initial reviews with author and verified tag', () => {
    const initial: ReviewPage = { data: [review('r1')], nextCursor: null, summary: SUMMARY };
    render(<ReviewList productId="p1" initial={initial} />);
    expect(screen.getByText('Title r1')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText(/verified purchase/i)).toBeInTheDocument();
  });

  it('hides "Load more" when nextCursor is null', () => {
    const initial: ReviewPage = { data: [review('r1')], nextCursor: null, summary: SUMMARY };
    render(<ReviewList productId="p1" initial={initial} />);
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('appends the next page and requests the proxy with the cursor', async () => {
    const initial: ReviewPage = {
      data: [review('r1')],
      nextCursor: 'cur-1',
      summary: SUMMARY,
    };
    const nextPage: ReviewPage = {
      data: [review('r2')],
      nextCursor: null,
      summary: SUMMARY,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, nextPage));
    vi.stubGlobal('fetch', fetchMock);

    render(<ReviewList productId="p1" initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));

    await waitFor(() => expect(screen.getByText('Title r2')).toBeInTheDocument());
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/products/p1/reviews');
    expect(url).toContain('cursor=cur-1');
    expect(url).toContain('limit=10');
    // nextCursor now null → button gone.
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('shows an inline retry message on a load failure without breaking existing reviews', async () => {
    const initial: ReviewPage = { data: [review('r1')], nextCursor: 'cur-1', summary: SUMMARY };
    const fetchMock = vi.fn().mockRejectedValue(new Error('network'));
    vi.stubGlobal('fetch', fetchMock);

    render(<ReviewList productId="p1" initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));

    await waitFor(() =>
      expect(screen.getByText(/couldn.t load more reviews/i)).toBeInTheDocument(),
    );
    // Existing review still visible; button still available to retry.
    expect(screen.getByText('Title r1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });
});
