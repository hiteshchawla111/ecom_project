'use client';

import { useState } from 'react';
import { FormError, SubmitButton, TextField } from '@/components/auth/fields';
import { useAuthSubmit } from '@/components/auth/useAuthSubmit';

const MAX_NAME = 120;

export function SellerRegisterForm() {
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const { submit, error, pending, setError } = useAuthSubmit(
    '/api/seller/register',
    '/account/seller',
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    if (name.length < 2) {
      setError('Please enter a shop display name (at least 2 characters).');
      return;
    }
    if (name.length > MAX_NAME) {
      setError(`Display name must be at most ${MAX_NAME} characters.`);
      return;
    }
    await submit({ displayName: name, description, logoUrl });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <TextField
        label="Shop display name"
        name="displayName"
        value={displayName}
        onChange={setDisplayName}
        required
        hint="This is the name buyers will see. 2–120 characters."
      />
      <TextField
        label="Description (optional)"
        name="description"
        value={description}
        onChange={setDescription}
        hint="A short summary of what you sell."
      />
      <TextField
        label="Logo URL (optional)"
        name="logoUrl"
        value={logoUrl}
        onChange={setLogoUrl}
        hint="An http(s) link to your shop logo."
      />
      <SubmitButton pending={pending}>Submit application</SubmitButton>
    </form>
  );
}
