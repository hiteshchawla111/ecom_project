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

  const inputClass =
    'h-12 w-full border border-line bg-surface px-4 text-sm text-content transition-colors focus:border-content focus:outline-none focus:ring-1 focus:ring-content';
  const labelClass =
    'flex flex-col gap-2 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-content-subtle';

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-sunk px-6 py-12">
      {/* Soft ambient brand wash for a calm, premium backdrop. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary-500/8 blur-3xl"
      />

      <div className="relative w-full max-w-md">
        {/* Brand mark above the card, centered. */}
        <div className="mb-8 flex flex-col items-center gap-1.5 text-center">
          <span className="font-serif text-2xl font-medium tracking-tight text-content">
            Coral&nbsp;Market
          </span>
          <span className="text-[0.7rem] font-medium uppercase tracking-[0.24em] text-content-subtle">
            Admin console
          </span>
        </div>

        {/* noValidate: all errors funnel through the catch handler to keep messages generic (no account-existence leak). */}
        <form
          onSubmit={onSubmit}
          noValidate
          className="flex w-full flex-col gap-6 border border-line bg-surface p-8 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_24px_48px_-24px_rgba(28,25,23,0.25)] sm:p-10"
        >
          <header className="flex flex-col gap-1.5">
            <h1 className="font-serif text-3xl font-medium tracking-tight text-content">
              Sign in
            </h1>
            <p className="text-sm text-content-muted">
              Welcome back. Enter your details to continue.
            </p>
          </header>

          {error && (
            <p
              role="alert"
              id="login-error"
              tabIndex={-1}
              ref={errorRef}
              className="bg-error-500/10 px-3 py-2 text-sm text-error-600"
            >
              {error}
            </p>
          )}

          <label className={labelClass}>
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
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
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
              className={inputClass}
            />
          </label>

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-primary-600 py-3.5 text-xs font-medium uppercase tracking-[0.16em] text-white transition-colors duration-300 hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50"
          >
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
