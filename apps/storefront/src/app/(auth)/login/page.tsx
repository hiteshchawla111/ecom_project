import Link from 'next/link';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-neutral-900">Sign in</h1>
        <p className="text-sm text-neutral-600">
          Welcome back. Enter your details to continue.
        </p>
      </header>
      <LoginForm />
      <p className="text-sm text-neutral-600">
        New here?{' '}
        <Link
          href="/register"
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
