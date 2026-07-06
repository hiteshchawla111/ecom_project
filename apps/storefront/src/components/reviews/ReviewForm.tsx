'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TextField, FormError, SubmitButton } from '@/components/auth/fields';

interface ReviewFormProps {
  productId: string;
  /** Whether the current viewer is a logged-in customer who may attempt a review. */
  canAttempt: boolean;
}

const STAR_COUNT = 5;

/** Accessible 5-star radiogroup. Click or arrow-key to select. */
function RatingInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Your rating"
      className="flex flex-col gap-2"
    >
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-content-subtle">
        Your rating
      </span>
      <div className="flex gap-1">
        {Array.from({ length: STAR_COUNT }, (_, i) => {
          const star = i + 1;
          const selected = star <= value;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
              tabIndex={star === (value || 1) ? 0 : -1}
              onClick={() => onChange(star)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  const next = Math.min(STAR_COUNT, (value || 0) + 1);
                  onChange(next);
                  const radios = e.currentTarget.parentElement?.querySelectorAll(
                    '[role="radio"]',
                  );
                  (radios?.[next - 1] as HTMLElement | undefined)?.focus();
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  const next = Math.max(1, (value || 1) - 1);
                  onChange(next);
                  const radios = e.currentTarget.parentElement?.querySelectorAll(
                    '[role="radio"]',
                  );
                  (radios?.[next - 1] as HTMLElement | undefined)?.focus();
                }
              }}
              className={`text-2xl leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 ${
                selected ? 'text-accent-400' : 'text-content-subtle'
              }`}
            >
              ★
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ReviewForm({ productId, canAttempt }: ReviewFormProps) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (!canAttempt) {
    return (
      <div className="border-t border-line pt-6">
        <Link
          href="/login"
          className="text-sm font-medium text-content underline underline-offset-4 transition-colors hover:text-primary-600"
        >
          Sign in to write a review
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="border-t border-line pt-6">
        <p className="text-sm text-success-500">
          Thanks — your review is posted.
        </p>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      setError('Please select a rating from 1 to 5.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/reviews`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rating,
          title: title.trim() || undefined,
          body: body.trim() || undefined,
        }),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setError(data?.message ?? 'Could not post your review.');
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError('Could not post your review. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-4 border-t border-line pt-6"
    >
      <h3 className="font-heading text-lg text-content">Write a review</h3>
      <RatingInput value={rating} onChange={setRating} />
      <TextField
        label="Title (optional)"
        name="title"
        value={title}
        onChange={setTitle}
      />
      <TextField
        label="Review (optional)"
        name="body"
        value={body}
        onChange={setBody}
      />
      <FormError message={error} />
      <div className="max-w-xs">
        <SubmitButton pending={pending}>Post review</SubmitButton>
      </div>
    </form>
  );
}
