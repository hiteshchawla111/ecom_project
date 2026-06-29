'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormError, SubmitButton, TextField } from '@/components/auth/fields';

const MAX_NAME = 120;

interface RegisterResponseBody {
  ok?: boolean;
  reauth?: boolean;
  message?: string;
}

export function SellerRegisterForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/seller/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: name, description, logoUrl }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as RegisterResponseBody | null;
        setError(data?.message ?? 'Something went wrong. Please try again.');
        return;
      }
      const body = (await res.json().catch(() => ({}))) as RegisterResponseBody;
      if (body.reauth === true) {
        router.push('/login?next=/account/seller');
      } else {
        router.push('/account/seller');
        router.refresh();
      }
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally {
      setPending(false);
    }
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
