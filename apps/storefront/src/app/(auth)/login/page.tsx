import Link from 'next/link';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';
import { safeNext } from '@/lib/safe-next';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNext(next);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.24em] text-content-subtle">
          Welcome back
        </span>
        <h1 className="font-heading text-3xl font-medium tracking-[-0.01em] text-content">
          Sign in
        </h1>
        <p className="text-sm text-content-muted">
          Enter your details to continue.
        </p>
      </header>
      <LoginForm next={target} />
      <div className="flex flex-col gap-3 text-sm text-content-muted">
        <Link href="/forgot-password" className="font-medium text-content underline underline-offset-4 hover:text-primary-700">
          Forgot password?
        </Link>
        <span>
          New here?{' '}
          <Link href="/register" className="font-medium text-content underline underline-offset-4 hover:text-primary-700">
            Create an account
          </Link>
        </span>
      </div>
    </div>
  );
}
