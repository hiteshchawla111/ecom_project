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
      className="border border-line px-6 py-3 text-xs font-medium uppercase tracking-[0.14em] text-content transition-colors duration-300 hover:border-content hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 disabled:opacity-60"
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
