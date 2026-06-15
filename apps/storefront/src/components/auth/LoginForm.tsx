'use client';

import { useState } from 'react';
import { FormError, SubmitButton, TextField } from './fields';
import { useAuthSubmit } from './useAuthSubmit';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { submit, error, pending } = useAuthSubmit('/api/auth/login');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit({ email, password });
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
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        required
      />
      <SubmitButton pending={pending}>Sign in</SubmitButton>
    </form>
  );
}
