'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    // Best-effort server revocation; navigate home regardless of the outcome.
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore — cookies are cleared server-side and we redirect anyway */
    }
    router.push('/');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-md border border-line px-4 py-2 font-medium text-content transition-colors hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-primary-300 disabled:opacity-60"
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
