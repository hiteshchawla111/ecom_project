'use client';

import { useState } from 'react';
import type { Review, ReviewPage } from '@/lib/reviews';

interface ReviewListProps {
  productId: string;
  initial: ReviewPage;
}

const PAGE_LIMIT = 10;
const STAR_COUNT = 5;

function StarRow({ rating }: { rating: number }) {
  return (
    <span aria-label={`Rated ${rating} out of 5`} className="flex text-sm">
      {Array.from({ length: STAR_COUNT }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={i < rating ? 'text-accent-400' : 'text-content-subtle'}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function ReviewItem({ review }: { review: Review }) {
  return (
    <li className="flex flex-col gap-2 border-t border-line py-6">
      <StarRow rating={review.rating} />
      {review.title ? (
        <h3 className="font-medium text-content">{review.title}</h3>
      ) : null}
      {review.body ? (
        <p className="leading-relaxed text-content-muted">{review.body}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-subtle">
        <span className="text-content-muted">{review.authorName}</span>
        {review.isVerified ? (
          <span className="uppercase tracking-[0.1em] text-success-500">
            Verified purchase
          </span>
        ) : null}
        {review.publishedAt ? <span>{formatDate(review.publishedAt)}</span> : null}
      </div>
    </li>
  );
}

export function ReviewList({ productId, initial }: ReviewListProps) {
  const [reviews, setReviews] = useState<Review[]>(initial.data);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        cursor: nextCursor,
        limit: String(PAGE_LIMIT),
      });
      const res = await fetch(
        `/api/products/${productId}/reviews?${params.toString()}`,
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      const page = (await res.json()) as ReviewPage;
      setReviews((prev) => [...prev, ...page.data]);
      setNextCursor(page.nextCursor);
    } catch {
      setError('Couldn’t load more reviews. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col">
        {reviews.map((r) => (
          <ReviewItem key={r.id} review={r} />
        ))}
      </ul>
      {error ? (
        <p role="alert" className="py-3 text-sm text-error-600">
          {error}
        </p>
      ) : null}
      {nextCursor ? (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="mt-4 self-start border border-line px-6 py-3 text-xs font-medium uppercase tracking-[0.14em] text-content transition-colors hover:border-content disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </div>
  );
}
