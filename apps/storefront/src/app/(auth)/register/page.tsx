import Link from 'next/link';
import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata: Metadata = { title: 'Create account' };

export default function RegisterPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-neutral-900">
          Create account
        </h1>
        <p className="text-sm text-neutral-600">
          Join us to start shopping and track your orders.
        </p>
      </header>
      <RegisterForm />
      <p className="text-sm text-neutral-600">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
