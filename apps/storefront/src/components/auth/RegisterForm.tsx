'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormError, SubmitButton, TextField } from './fields';

const MIN_PASSWORD = 8;
const MAX_SHOP_NAME = 120;

type Intent = 'shop' | 'sell';

interface ApiBody {
  ok?: boolean;
  reauth?: boolean;
  message?: string;
}

/**
 * Unified registration. A Shop/Sell toggle picks the intent up front:
 * - "Shop" creates a customer account (POST /api/auth/register), then home.
 * - "Sell" creates the account, then chains the seller application
 *   (POST /api/seller/register) so a new seller is set up in one flow. If the
 *   seller step needs a fresh session, it routes to login → /account/seller.
 *
 * Both API calls already exist; this orchestrates the existing two steps behind
 * one form per the approved unified-signup UX.
 */
export function RegisterForm() {
  const router = useRouter();
  const [intent, setIntent] = useState<Intent>('shop');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [shopName, setShopName] = useState('');
  const [shopDescription, setShopDescription] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (intent === 'sell') {
      const trimmed = shopName.trim();
      if (trimmed.length < 2 || trimmed.length > MAX_SHOP_NAME) {
        setError('Enter a shop name between 2 and 120 characters.');
        return;
      }
    }

    setError(null);
    setPending(true);
    try {
      // Step 1 — create the account.
      const reg = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (!reg.ok) {
        const body = (await reg.json().catch(() => null)) as ApiBody | null;
        setError(body?.message ?? 'Unable to create your account.');
        return;
      }

      // Shoppers are done — go home.
      if (intent === 'shop') {
        router.push('/');
        router.refresh();
        return;
      }

      // Step 2 — sellers also submit the shop application.
      const seller = await fetch('/api/seller/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: shopName.trim(),
          description: shopDescription,
          logoUrl: '',
        }),
      });
      if (!seller.ok) {
        // Account exists; the shop step failed — send them to the dedicated
        // seller page to retry rather than losing the account.
        router.push('/sell');
        return;
      }
      const body = (await seller.json().catch(() => ({}))) as ApiBody;
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
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {/* Intent toggle — Shop vs Sell. */}
      <div
        role="radiogroup"
        aria-label="What would you like to do?"
        className="grid grid-cols-2 gap-px overflow-hidden border border-line bg-line"
      >
        {(
          [
            { value: 'shop', title: 'Shop', sub: 'Buy & track orders' },
            { value: 'sell', title: 'Sell', sub: 'Open a shop' },
          ] as const
        ).map((opt) => {
          const active = intent === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setIntent(opt.value)}
              className={`flex flex-col items-center gap-1 px-4 py-4 text-center transition-colors duration-200 ${
                active
                  ? 'bg-content text-surface'
                  : 'bg-surface text-content hover:bg-surface-muted'
              }`}
            >
              <span className="font-heading text-lg font-medium">{opt.title}</span>
              <span
                className={`text-[0.7rem] uppercase tracking-[0.1em] ${active ? 'text-surface/70' : 'text-content-subtle'}`}
              >
                {opt.sub}
              </span>
            </button>
          );
        })}
      </div>

      <FormError message={error} />

      <TextField label="Name" name="name" value={name} onChange={setName} autoComplete="name" required />
      <TextField label="Email" name="email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
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

      {intent === 'sell' && (
        <div className="flex flex-col gap-5 border-t border-line pt-5">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-content-subtle">
            Your shop
          </p>
          <TextField
            label="Shop name"
            name="shopName"
            value={shopName}
            onChange={setShopName}
            required
            hint="The name buyers will see. 2–120 characters."
          />
          <TextField
            label="What you sell (optional)"
            name="shopDescription"
            value={shopDescription}
            onChange={setShopDescription}
            hint="A short summary of your shop."
          />
        </div>
      )}

      <SubmitButton pending={pending}>
        {intent === 'sell' ? 'Create account & open shop' : 'Create account'}
      </SubmitButton>
    </form>
  );
}
