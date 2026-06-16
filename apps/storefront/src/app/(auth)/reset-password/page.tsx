import Link from 'next/link';
import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export const metadata: Metadata = { title: 'Set a new password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-neutral-900">
          Set a new password
        </h1>
        <p className="text-sm text-neutral-600">
          Choose a new password for your account.
        </p>
      </header>
      <ResetPasswordForm token={token ?? ''} />
      <p className="text-sm text-neutral-600">
        Remembered it?{' '}
        <Link
          href="/login"
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
