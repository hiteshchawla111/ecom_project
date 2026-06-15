'use client';

import { useState } from 'react';
import { FormError, SubmitButton, TextField } from './fields';
import { useAuthSubmit } from './useAuthSubmit';

const MIN_PASSWORD = 8;

export function RegisterForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { submit, error, pending, setError } = useAuthSubmit('/api/auth/register');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    await submit({ name, email, password });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <TextField
        label="Name"
        name="name"
        value={name}
        onChange={setName}
        autoComplete="name"
        required
      />
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
        autoComplete="new-password"
        required
        hint={`At least ${MIN_PASSWORD} characters.`}
      />
      <SubmitButton pending={pending}>Create account</SubmitButton>
    </form>
  );
}
