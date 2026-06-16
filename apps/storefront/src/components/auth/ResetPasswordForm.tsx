'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FormError, SubmitButton, TextField } from './fields';
import { useAuthSubmit } from './useAuthSubmit';

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { submit, error, pending, setError } = useAuthSubmit(
    '/api/auth/password-reset/confirm',
    '/login',
  );

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <FormError message="This reset link is invalid or expired." />
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    await submit({ token, password });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <TextField
        label="New password"
        name="password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        required
        hint="At least 8 characters."
      />
      <TextField
        label="Confirm password"
        name="confirm"
        type="password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        required
      />
      <SubmitButton pending={pending}>Reset password</SubmitButton>
    </form>
  );
}
