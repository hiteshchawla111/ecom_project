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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-content">My account</h1>
        <p className="text-sm text-content-muted">
          Manage your profile and view your orders.
        </p>
      </header>

      <dl className="rounded-lg border border-line bg-surface p-6">
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium uppercase tracking-wide text-content-subtle">
            Email
          </dt>
          <dd className="text-content">{user.email}</dd>
        </div>
      </dl>

      <div>
        <LogoutButton />
      </div>
    </main>
  );
}
