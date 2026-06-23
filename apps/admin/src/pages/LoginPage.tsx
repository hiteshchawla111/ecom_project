import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/types';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Move focus to the error alert once it renders, so keyboard/SR users notice it.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 401
          ? 'Invalid email or password.'
          : 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      {/* noValidate: all errors funnel through the catch handler to keep messages generic (no account-existence leak). */}
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-line bg-surface p-6"
      >
        <h1 className="font-heading text-2xl font-semibold text-content">Admin sign in</h1>

        {error && (
          <p
            role="alert"
            id="login-error"
            tabIndex={-1}
            ref={errorRef}
            className="rounded-md bg-error-500/10 px-3 py-2 text-sm text-error-600"
          >
            {error}
          </p>
        )}

        <label className="flex flex-col gap-1 text-sm font-medium text-content">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            aria-invalid={!!error}
            aria-describedby={error ? 'login-error' : undefined}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-line px-3 py-2 text-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-content">
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            aria-invalid={!!error}
            aria-describedby={error ? 'login-error' : undefined}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-line px-3 py-2 text-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary-500 px-4 py-2 font-medium text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
