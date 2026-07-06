import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatAvg, ProductReviews } from './ProductReviews';
import type { ReviewPage } from '@/lib/reviews';

vi.mock('@/lib/reviews', () => ({ getReviewsFor: vi.fn() }));
vi.mock('@/lib/session', () => ({ getCurrentUser: vi.fn() }));

import { getReviewsFor } from '@/lib/reviews';
import { getCurrentUser } from '@/lib/session';

const withReviews: ReviewPage = {
  data: [
    {
      id: 'r1',
      rating: 4,
      title: 'Solid',
      body: 'Works well',
      isVerified: true,
      authorName: 'Ada',
      publishedAt: '2026-07-01T00:00:00.000Z',
    },
  ],
  nextCursor: null,
  summary: {
    ratingAvg: '4', // Prisma strips the trailing zero — must display as 4.0
    ratingCount: 1,
    distribution: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 0 },
  },
};

const empty: ReviewPage = {
  data: [],
  nextCursor: null,
  summary: {
    ratingAvg: null,
    ratingCount: 0,
    distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
  },
};

describe('formatAvg', () => {
  it('formats a raw Decimal string to one decimal place', () => {
    expect(formatAvg('4')).toBe('4.0');
    expect(formatAvg('4.00')).toBe('4.0');
    expect(formatAvg('4.5')).toBe('4.5');
  });
  it('returns null when there is no average', () => {
    expect(formatAvg(null)).toBeNull();
  });
});

describe('ProductReviews', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the formatted average, count and a review when there are reviews', async () => {
    vi.mocked(getReviewsFor).mockResolvedValue(withReviews);
    vi.mocked(getCurrentUser).mockResolvedValue({ sub: 'u1', email: 'a@b.c', role: 'CUSTOMER' });
    render(await ProductReviews({ productId: 'p1' }));
    expect(screen.getByText('4.0')).toBeInTheDocument();
    expect(screen.getByText(/1 review/i)).toBeInTheDocument();
    expect(screen.getByText('Solid')).toBeInTheDocument();
    // Logged-in → form present.
    expect(screen.getByRole('button', { name: /post review/i })).toBeInTheDocument();
  });

  it('shows the empty state and a sign-in link for a guest with no reviews', async () => {
    vi.mocked(getReviewsFor).mockResolvedValue(empty);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    render(await ProductReviews({ productId: 'p1' }));
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in to write a review/i })).toBeInTheDocument();
  });
});
