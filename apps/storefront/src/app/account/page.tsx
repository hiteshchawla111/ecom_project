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
        <h1 className="text-2xl font-semibold text-neutral-900">My account</h1>
        <p className="text-sm text-neutral-600">
          Manage your profile and view your orders.
        </p>
      </header>

      <dl className="rounded-lg border border-neutral-200 bg-neutral-0 p-6">
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Email
          </dt>
          <dd className="text-neutral-900">{user.email}</dd>
        </div>
      </dl>

      <div>
        <LogoutButton />
      </div>
    </main>
  );
}
