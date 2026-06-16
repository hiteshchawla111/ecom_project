'use client';

import { useState } from 'react';
import { FormError, SubmitButton, TextField } from './fields';
import { useAuthSubmit } from './useAuthSubmit';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const { submit, error, pending } = useAuthSubmit(
    '/api/auth/password-reset/request',
    '/login',
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit({ email });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <TextField
        label="Email"
        name="email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        required
        hint="We'll email a reset link if an account exists."
      />
      <SubmitButton pending={pending}>Send reset link</SubmitButton>
    </form>
  );
}
