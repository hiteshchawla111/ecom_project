import Link from 'next/link';
import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export const metadata: Metadata = { title: 'Reset password' };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-neutral-900">
          Reset your password
        </h1>
        <p className="text-sm text-neutral-600">
          Enter your email and we&apos;ll send a link to set a new password.
        </p>
      </header>
      <ForgotPasswordForm />
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
