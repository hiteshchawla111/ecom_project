import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/session';
import { LogoutButton } from '@/components/auth/LogoutButton';

export const metadata: Metadata = { title: 'My account' };

export default async function AccountPage() {
  // Defense in depth: middleware gates on cookie presence; this verifies the
  // session against the API and resolves the actual user.
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 pb-24 pt-12">
      <header className="flex flex-col gap-2 border-b border-line pb-8">
        <span className="text-xs font-medium uppercase tracking-[0.28em] text-content-subtle">
          {user.role === 'SELLER' ? 'Seller account' : 'Your account'}
        </span>
        <h1 className="font-heading text-4xl font-medium tracking-[-0.01em] text-content sm:text-5xl">
          My account
        </h1>
      </header>

      <dl className="divide-y divide-line border-y border-line">
        <div className="flex items-center justify-between gap-4 py-4">
          <dt className="text-xs font-medium uppercase tracking-[0.14em] text-content-subtle">
            Email
          </dt>
          <dd className="text-content">{user.email}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-4">
          <dt className="text-xs font-medium uppercase tracking-[0.14em] text-content-subtle">
            Account type
          </dt>
          <dd className="text-content">
            {user.role === 'SELLER' ? 'Seller' : 'Customer'}
          </dd>
        </div>
      </dl>

      {/* Quick links */}
      <div className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2">
        <Link
          href="/orders"
          className="group flex items-center justify-between bg-surface p-6 transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
        >
          <span className="flex flex-col gap-1">
            <span className="font-heading text-lg font-medium text-content">
              Your orders
            </span>
            <span className="text-sm text-content-muted">
              Track and review past orders
            </span>
          </span>
          <Arrow />
        </Link>
        <Link
          href="/products"
          className="group flex items-center justify-between bg-surface p-6 transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
        >
          <span className="flex flex-col gap-1">
            <span className="font-heading text-lg font-medium text-content">
              Continue shopping
            </span>
            <span className="text-sm text-content-muted">
              Browse the latest arrivals
            </span>
          </span>
          <Arrow />
        </Link>
      </div>

      {user.role === 'SELLER' ? (
        <Link
          href="/account/seller"
          className="flex w-fit items-center gap-2 bg-content px-8 py-3.5 text-xs font-medium uppercase tracking-[0.14em] text-surface transition-colors duration-300 hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
        >
          Manage your shop
        </Link>
      ) : (
        <div className="relative isolate overflow-hidden border border-line bg-neutral-900 p-8 text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary-500/20 blur-3xl"
          />
          <div className="relative flex flex-col items-start gap-3">
            <h2 className="font-heading text-2xl font-medium">Start selling</h2>
            <p className="max-w-md text-sm leading-relaxed text-white/70">
              Open a shop and reach customers across the marketplace.
            </p>
            <Link
              href="/sell"
              className="mt-2 bg-white px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-neutral-900 transition-colors duration-300 hover:bg-primary-500 hover:text-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Become a seller
            </Link>
          </div>
        </div>
      )}

      <div className="border-t border-line pt-6">
        <LogoutButton />
      </div>
    </main>
  );
}

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 text-content-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-content"
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
