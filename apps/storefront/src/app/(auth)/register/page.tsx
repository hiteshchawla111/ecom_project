import Link from 'next/link';
import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata: Metadata = { title: 'Create account' };

export default function RegisterPage() {
  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.24em] text-content-subtle">
          Create account
        </span>
        <h1 className="font-heading text-3xl font-medium tracking-[-0.01em] text-content">
          Join Coral Market
        </h1>
        <p className="text-sm text-content-muted">
          Shop the catalog, or open your own shop — choose below.
        </p>
      </header>
      <RegisterForm />
      <p className="text-sm text-content-muted">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-medium text-content underline underline-offset-4 hover:text-primary-700"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
