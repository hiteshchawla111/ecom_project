'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ErrorBody {
  message?: string;
}

/**
 * Shared submit logic for the auth forms: POST a JSON body to a route handler,
 * surface the API error message, and redirect home on success.
 */
export function useAuthSubmit(endpoint: string, redirectTo = '/') {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(body: Record<string, string>): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as ErrorBody | null;
        setError(data?.message ?? 'Something went wrong. Please try again.');
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return { submit, error, pending, setError };
}
