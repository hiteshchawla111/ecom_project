# Storefront Password-Reset UI & Guest Route Guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add storefront `/forgot-password` and `/reset-password` pages wired to the existing API reset endpoints, plus a proxy-level guard that redirects logged-in users away from auth pages to `/`.

**Architecture:** Reuse the established storefront auth pattern — pure testable guards in `route-protection.ts` driven by `proxy.ts`; pure route handlers in `handlers.ts` with injectable `RouteDeps`; thin `route.ts` adapters; `(auth)` card layout + `fields.tsx` primitives; the shared `useAuthSubmit` hook (generalized to accept a redirect target). The API is enumeration-safe and revokes all sessions on confirm.

**Tech Stack:** Next.js (App Router), TypeScript, Vitest + React Testing Library, Playwright, Tailwind v4 (design tokens).

**Spec:** `docs/superpowers/specs/2026-06-15-storefront-password-reset-and-guest-guard-design.md`

**Working dir for all commands:** `apps/storefront`. Run tests with `npm test -- <pattern>` (Vitest). All paths below are relative to `apps/storefront/`.

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/lib/route-protection.ts` | Pure routing guards | Modify — add `AUTH_PREFIXES`, `isAuthRoute`, `guestRedirectFor` |
| `src/lib/route-protection.test.ts` | Guard unit tests | Modify — add guest-guard cases |
| `src/proxy.ts` | Edge middleware applying guards | Modify — apply `guestRedirectFor`, widen matcher |
| `src/app/api/auth/handlers.ts` | Pure auth route logic | Modify — `RouteDeps` + `handleRequestReset`/`handleConfirmReset` |
| `src/app/api/auth/handlers.test.ts` | Handler unit tests | Modify — add reset cases |
| `src/app/api/auth/route-deps.ts` | Live dependency wiring | Modify — wire the two reset deps |
| `src/app/api/auth/password-reset/request/route.ts` | Request adapter | Create |
| `src/app/api/auth/password-reset/confirm/route.ts` | Confirm adapter | Create |
| `src/components/auth/useAuthSubmit.ts` | Shared submit hook | Modify — accept `{ redirectTo }` |
| `src/components/auth/ForgotPasswordForm.tsx` | Request form | Create |
| `src/components/auth/ForgotPasswordForm.test.tsx` | Request form tests | Create |
| `src/components/auth/ResetPasswordForm.tsx` | Confirm form | Create |
| `src/components/auth/ResetPasswordForm.test.tsx` | Confirm form tests | Create |
| `src/app/(auth)/forgot-password/page.tsx` | Request page | Create |
| `src/app/(auth)/reset-password/page.tsx` | Confirm page | Create |
| `src/app/(auth)/login/page.tsx` | Login page | Modify — add "Forgot password?" link |
| `e2e/password-reset.spec.ts` | E2E coverage | Create |

---

## Task 1: Guest guard — pure helpers in route-protection.ts

**Files:**
- Modify: `src/lib/route-protection.ts`
- Test: `src/lib/route-protection.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/route-protection.test.ts` (and add `guestRedirectFor`, `isAuthRoute` to the import on line 2):

```ts
import { guestRedirectFor, isAuthRoute, loginRedirectFor } from './route-protection';

describe('isAuthRoute', () => {
  it('matches the auth routes', () => {
    expect(isAuthRoute('/login')).toBe(true);
    expect(isAuthRoute('/register')).toBe(true);
    expect(isAuthRoute('/forgot-password')).toBe(true);
    expect(isAuthRoute('/reset-password')).toBe(true);
  });

  it('rejects non-auth routes', () => {
    expect(isAuthRoute('/')).toBe(false);
    expect(isAuthRoute('/account')).toBe(false);
    expect(isAuthRoute('/loginx')).toBe(false);
  });
});

describe('guestRedirectFor', () => {
  it('redirects an authenticated user away from auth routes to /', () => {
    expect(guestRedirectFor('/login', true)).toBe('/');
    expect(guestRedirectFor('/register', true)).toBe('/');
    expect(guestRedirectFor('/forgot-password', true)).toBe('/');
    expect(guestRedirectFor('/reset-password', true)).toBe('/');
  });

  it('allows an unauthenticated user on auth routes', () => {
    expect(guestRedirectFor('/login', false)).toBeNull();
    expect(guestRedirectFor('/forgot-password', false)).toBeNull();
  });

  it('never redirects non-auth routes', () => {
    expect(guestRedirectFor('/', true)).toBeNull();
    expect(guestRedirectFor('/account', true)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- route-protection`
Expected: FAIL — `guestRedirectFor`/`isAuthRoute` not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/route-protection.ts`:

```ts
/** Auth routes a logged-in customer should be bounced away from. */
const AUTH_PREFIXES = ['/login', '/register', '/forgot-password', '/reset-password'];

export function isAuthRoute(pathname: string): boolean {
  return AUTH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Decide whether an authenticated request should be redirected off an auth page.
 * `hasSession` reflects only cookie presence.
 *
 * @returns the redirect target, or null to proceed.
 */
export function guestRedirectFor(
  pathname: string,
  hasSession: boolean,
): string | null {
  if (isAuthRoute(pathname) && hasSession) return '/';
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- route-protection`
Expected: PASS (existing `loginRedirectFor` tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/route-protection.ts src/lib/route-protection.test.ts
git commit -m "feat(storefront): add guest-route guard helper"
```

---

## Task 2: Apply the guest guard in proxy.ts

**Files:**
- Modify: `src/proxy.ts`

No new unit test (Next middleware integration is covered by E2E in Task 9). This task wires the Task 1 helper.

- [ ] **Step 1: Update the proxy**

Replace the body of `src/proxy.ts` with:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { guestRedirectFor, loginRedirectFor } from '@/lib/route-protection';

// Mirror of REFRESH_COOKIE in lib/session.ts. Kept inline because the proxy
// runs on the edge and must not import the `server-only`-guarded session module.
const REFRESH_COOKIE = 'sf_refresh';

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(REFRESH_COOKIE);
  const target =
    loginRedirectFor(pathname, hasSession) ??
    guestRedirectFor(pathname, hasSession);
  if (target) {
    const url = req.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/account/:path*',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
  ],
};
```

- [ ] **Step 2: Verify build/typecheck**

Run: `npm run lint`
Expected: clean (no unused imports, no type errors).

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(storefront): bounce logged-in users off auth pages"
```

---

## Task 3: Reset handlers — handleRequestReset & handleConfirmReset

**Files:**
- Modify: `src/app/api/auth/handlers.ts`
- Test: `src/app/api/auth/handlers.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/app/api/auth/handlers.test.ts`, add `requestReset`/`confirmReset` to the `deps()` factory (inside the returned object, before `...over`):

```ts
    requestReset: vi.fn(async () => ({ ok: true as const })),
    confirmReset: vi.fn(async () => ({ ok: true as const })),
```

Add `handleConfirmReset, handleRequestReset` to the import from `./handlers`, then append:

```ts
describe('handleRequestReset', () => {
  it('requests a reset with a trimmed email and returns 200', async () => {
    const d = deps();
    const res = await handleRequestReset({ email: '  a@test.com ' }, d);

    expect(d.requestReset).toHaveBeenCalledWith('a@test.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 200 for a non-existent email (enumeration-safe)', async () => {
    const d = deps({ requestReset: vi.fn(async () => ({ ok: true as const })) });
    const res = await handleRequestReset({ email: 'ghost@test.com' }, d);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 400 when email is missing', async () => {
    const d = deps();
    const res = await handleRequestReset({ email: '' }, d);

    expect(res.status).toBe(400);
    expect(d.requestReset).not.toHaveBeenCalled();
  });

  it('maps an API error to its status and message', async () => {
    const d = deps({
      requestReset: vi.fn(async () => {
        throw new ApiAuthError('email must be an email', 400);
      }),
    });
    const res = await handleRequestReset({ email: 'nope' }, d);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'email must be an email' });
  });
});

describe('handleConfirmReset', () => {
  it('confirms the reset and returns 200', async () => {
    const d = deps();
    const res = await handleConfirmReset(
      { token: 'tok', password: 'password123' },
      d,
    );

    expect(d.confirmReset).toHaveBeenCalledWith('tok', 'password123');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 400 when the token is missing (no API call)', async () => {
    const d = deps();
    const res = await handleConfirmReset({ token: '', password: 'password123' }, d);

    expect(res.status).toBe(400);
    expect(d.confirmReset).not.toHaveBeenCalled();
  });

  it('returns 400 when the password is too short (no API call)', async () => {
    const d = deps();
    const res = await handleConfirmReset({ token: 'tok', password: 'short' }, d);

    expect(res.status).toBe(400);
    expect(d.confirmReset).not.toHaveBeenCalled();
  });

  it('maps an invalid/expired token API error', async () => {
    const d = deps({
      confirmReset: vi.fn(async () => {
        throw new ApiAuthError('Invalid or expired reset token', 400);
      }),
    });
    const res = await handleConfirmReset(
      { token: 'bad', password: 'password123' },
      d,
    );

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Invalid or expired reset token' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- handlers`
Expected: FAIL — `handleRequestReset`/`handleConfirmReset` not exported; `requestReset`/`confirmReset` not on `RouteDeps`.

- [ ] **Step 3: Implement the handlers**

In `src/app/api/auth/handlers.ts`, add two methods to the `RouteDeps` interface (after `getRefreshToken`):

```ts
  requestReset(email: string): Promise<{ ok: true }>;
  confirmReset(token: string, password: string): Promise<{ ok: true }>;
```

Append the two handlers at the end of the file:

```ts
export async function handleRequestReset(
  input: { email?: string },
  deps: RouteDeps,
): Promise<HandlerResult> {
  const email = input.email?.trim() ?? '';
  if (!email) {
    return badRequest('Email is required.');
  }
  try {
    // Enumeration-safe: the API returns { ok: true } regardless of existence.
    await deps.requestReset(email);
    return { status: 200, body: { ok: true } };
  } catch (err) {
    return fromApiError(err);
  }
}

export async function handleConfirmReset(
  input: { token?: string; password?: string },
  deps: RouteDeps,
): Promise<HandlerResult> {
  const token = input.token?.trim() ?? '';
  const password = input.password ?? '';
  if (!token) {
    return badRequest('Reset token is required.');
  }
  if (password.length < 8) {
    return badRequest('Password must be at least 8 characters.');
  }
  try {
    await deps.confirmReset(token, password);
    return { status: 200, body: { ok: true } };
  } catch (err) {
    return fromApiError(err);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- handlers`
Expected: PASS (existing register/login/logout tests still green — the new deps have defaults in the factory).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/handlers.ts src/app/api/auth/handlers.test.ts
git commit -m "feat(storefront): add password-reset request/confirm handlers"
```

---

## Task 4: Wire the reset deps in route-deps.ts

**Files:**
- Modify: `src/app/api/auth/route-deps.ts`

Covered by the handler tests (Task 3) using stubs; this wires the real client. Verified via lint + the Task 9 smoke run.

- [ ] **Step 1: Update the live deps**

In `src/app/api/auth/route-deps.ts`, extend the import from `@/lib/api-auth` to alias the reset functions, and add the two deps to the returned object.

Change the import block to:

```ts
import {
  confirmReset as apiConfirmReset,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  requestReset as apiRequestReset,
} from '@/lib/api-auth';
```

Add inside the returned object (after `getRefreshToken`):

```ts
    requestReset: (email) => apiRequestReset(email, { baseUrl }),
    confirmReset: (token, password) =>
      apiConfirmReset(token, password, { baseUrl }),
```

- [ ] **Step 2: Verify typecheck/lint**

Run: `npm run lint`
Expected: clean — `RouteDeps` is fully satisfied.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/route-deps.ts
git commit -m "feat(storefront): wire live password-reset deps"
```

---

## Task 5: Route adapters for the two reset endpoints

**Files:**
- Create: `src/app/api/auth/password-reset/request/route.ts`
- Create: `src/app/api/auth/password-reset/confirm/route.ts`

Thin adapters mirroring `login/route.ts`; exercised end-to-end in Task 9.

- [ ] **Step 1: Create the request adapter**

`src/app/api/auth/password-reset/request/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { handleRequestReset } from '../../handlers';
import { liveRouteDeps } from '../../route-deps';

export async function POST(req: Request) {
  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handleRequestReset(
    { email: input.email as string },
    liveRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 2: Create the confirm adapter**

`src/app/api/auth/password-reset/confirm/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { handleConfirmReset } from '../../handlers';
import { liveRouteDeps } from '../../route-deps';

export async function POST(req: Request) {
  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handleConfirmReset(
    { token: input.token as string, password: input.password as string },
    liveRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 3: Verify lint/build**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/password-reset
git commit -m "feat(storefront): add password-reset route handlers"
```

---

## Task 6: Generalize useAuthSubmit with a redirect target

**Files:**
- Modify: `src/components/auth/useAuthSubmit.ts`

Backward-compatible: default stays `/`. Existing `LoginForm`/`RegisterForm` tests prove no regression.

- [ ] **Step 1: Update the hook signature**

In `src/components/auth/useAuthSubmit.ts`, change the function signature and the redirect line.

Replace `export function useAuthSubmit(endpoint: string) {` with:

```ts
export function useAuthSubmit(endpoint: string, redirectTo = '/') {
```

Replace `router.push('/');` with:

```ts
      router.push(redirectTo);
```

- [ ] **Step 2: Verify no regression**

Run: `npm test -- LoginForm RegisterForm`
Expected: PASS — both still redirect to `/`.

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/useAuthSubmit.ts
git commit -m "refactor(storefront): let useAuthSubmit take a redirect target"
```

---

## Task 7: ForgotPasswordForm component

**Files:**
- Create: `src/components/auth/ForgotPasswordForm.tsx`
- Test: `src/components/auth/ForgotPasswordForm.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/auth/ForgotPasswordForm.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { ForgotPasswordForm } from './ForgotPasswordForm';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('ForgotPasswordForm', () => {
  it('renders an accessible email field', () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /send reset link/i }),
    ).toBeInTheDocument();
  });

  it('posts the email and redirects to /login on success', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { ok: true }));
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText(/email/i), 'a@test.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/password-reset/request',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).toEqual({ email: 'a@test.com' });
  });

  it('shows the API error and does not redirect on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(400, { message: 'Email is required.' }),
    );
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/email is required/i);
    expect(pushMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ForgotPasswordForm`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

`src/components/auth/ForgotPasswordForm.tsx`:

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ForgotPasswordForm`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/ForgotPasswordForm.tsx src/components/auth/ForgotPasswordForm.test.tsx
git commit -m "feat(storefront): add ForgotPasswordForm"
```

---

## Task 8: ResetPasswordForm component

**Files:**
- Create: `src/components/auth/ResetPasswordForm.tsx`
- Test: `src/components/auth/ResetPasswordForm.test.tsx`

Client-side checks (match + min 8) run before any fetch. A missing token renders an invalid-link message instead of the form.

- [ ] **Step 1: Write the failing test**

`src/components/auth/ResetPasswordForm.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { ResetPasswordForm } from './ResetPasswordForm';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('ResetPasswordForm', () => {
  it('shows an invalid-link message and no form when token is empty', () => {
    render(<ResetPasswordForm token="" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid or expired/i);
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('rejects mismatched passwords without calling the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    render(<ResetPasswordForm token="tok" />);

    await user.type(screen.getByLabelText(/new password/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'different123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a too-short password without calling the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    render(<ResetPasswordForm token="tok" />);

    await user.type(screen.getByLabelText(/new password/i), 'short');
    await user.type(screen.getByLabelText(/confirm password/i), 'short');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts token + password and redirects to /login on success', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { ok: true }));
    const user = userEvent.setup();
    render(<ResetPasswordForm token="tok" />);

    await user.type(screen.getByLabelText(/new password/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).toEqual({ token: 'tok', password: 'password123' });
  });

  it('shows the API error on an invalid token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(400, { message: 'Invalid or expired reset token' }),
    );
    const user = userEvent.setup();
    render(<ResetPasswordForm token="bad" />);

    await user.type(screen.getByLabelText(/new password/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or expired/i);
    expect(pushMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ResetPasswordForm`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

`src/components/auth/ResetPasswordForm.tsx`:

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ResetPasswordForm`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/ResetPasswordForm.tsx src/components/auth/ResetPasswordForm.test.tsx
git commit -m "feat(storefront): add ResetPasswordForm"
```

---

## Task 9: Pages + login link + E2E + verification

**Files:**
- Create: `src/app/(auth)/forgot-password/page.tsx`
- Create: `src/app/(auth)/reset-password/page.tsx`
- Modify: `src/app/(auth)/login/page.tsx`
- Create: `e2e/password-reset.spec.ts`

- [ ] **Step 1: Create the forgot-password page**

`src/app/(auth)/forgot-password/page.tsx`:

```tsx
import Link from 'next/link';
import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export const metadata: Metadata = { title: 'Reset password' };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-neutral-900">
          Reset your password
        </h1>
        <p className="text-sm text-neutral-600">
          Enter your email and we&apos;ll send a link to set a new password.
        </p>
      </header>
      <ForgotPasswordForm />
      <p className="text-sm text-neutral-600">
        Remembered it?{' '}
        <Link
          href="/login"
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create the reset-password page**

`src/app/(auth)/reset-password/page.tsx` — `searchParams` is a Promise in the current App Router; await it.

```tsx
import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export const metadata: Metadata = { title: 'Set a new password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-neutral-900">
          Set a new password
        </h1>
        <p className="text-sm text-neutral-600">
          Choose a new password for your account.
        </p>
      </header>
      <ResetPasswordForm token={token ?? ''} />
    </div>
  );
}
```

- [ ] **Step 3: Add the "Forgot password?" link to the login page**

In `src/app/(auth)/login/page.tsx`, insert a link directly after `<LoginForm />` (before the "New here?" paragraph):

```tsx
      <LoginForm />
      <p className="text-sm text-neutral-600">
        <Link
          href="/forgot-password"
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Forgot password?
        </Link>
      </p>
```

(`Link` is already imported in that file.)

- [ ] **Step 4: Write the E2E spec**

`e2e/password-reset.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('forgot-password page renders and submitting redirects to login', async ({
  page,
}) => {
  await page.goto('/forgot-password');
  await expect(
    page.getByRole('heading', { name: /reset your password/i }),
  ).toBeVisible();

  await page.getByLabel(/email/i).fill('nobody@example.com');
  await page.getByRole('button', { name: /send reset link/i }).click();

  await expect(page).toHaveURL(/\/login$/);
});

test('reset-password with no token shows the invalid-link message', async ({
  page,
}) => {
  await page.goto('/reset-password');
  await expect(page.getByRole('alert')).toContainText(/invalid or expired/i);
  await expect(
    page.getByRole('link', { name: /request a new link/i }),
  ).toBeVisible();
});
```

> Note: the happy-path token-confirm flow needs a real DB token and is smoke-verified manually in Step 7 (not via an E2E DB fixture).

- [ ] **Step 5: Run the full unit suite + lint + build**

Run: `npm test`
Expected: PASS (all suites).
Run: `npm run lint`
Expected: clean.
Run: `npm run build`
Expected: build succeeds (pages compile).

- [ ] **Step 6: Run the E2E spec**

Run: `npm run test:e2e -- password-reset`
Expected: both tests PASS (Playwright auto-starts the dev server on `:5001`).

- [ ] **Step 7: Manual smoke run against the live API (RULE.md §5)**

Prereq: API running on `:5000` against `ecom_dev`, storefront `npm run dev` on `:5001`.

1. In a logged-out browser, visit `/login` → "Forgot password?" → `/forgot-password`. Submit a seeded user's email → redirected to `/login`.
2. Generate/read a reset token for that user from `ecom_dev` (the `PasswordResetToken` row stores a **hash**; for the smoke test, request a reset and read the raw token by temporarily logging it, or insert a known token via Prisma Studio with a matching hash). Visit `/reset-password?token=<raw>`, set a new password (≥8) → redirected to `/login`.
3. Log in with the new password → succeeds.
4. While logged in, visit `/login`, `/register`, `/forgot-password`, `/reset-password` → each redirects to `/`.
5. Visit `/reset-password` (no token) → invalid-link message shown.

Record the outcome honestly in the PR/commit notes; if step 2's token retrieval is awkward, note how it was done.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(auth)/forgot-password" "src/app/(auth)/reset-password" "src/app/(auth)/login/page.tsx" e2e/password-reset.spec.ts
git commit -m "feat(storefront): add forgot/reset-password pages + e2e"
```

- [ ] **Step 9: Update PLAN.md**

Mark the Phase 2 storefront password-reset follow-up done, and note the guest guard. Update line 38 (Current focus) to point at the next slice (**admin login + role-gated shell**), and tick the storefront follow-up in the Phase 2 section. Commit:

```bash
git add ../../PLAN.md
git commit -m "docs: mark storefront password-reset + guest guard done"
```

---

## Self-review notes

- **Spec coverage:** guest guard (Tasks 1–2), request handler/adapter (Tasks 3–5), confirm handler/adapter (Tasks 3–5), `useAuthSubmit` redirect (Task 6), both forms (Tasks 7–8), both pages + login link (Task 9), tests at every layer + E2E + manual smoke (Tasks 1, 3, 7, 8, 9). `api-auth.ts` `requestReset`/`confirmReset` already exist and are already unit-tested (`api-auth.test.ts` lines 104–113) — intentionally not re-added.
- **Enumeration safety:** preserved — `handleRequestReset` never branches on existence; the request form copy says "if an account exists".
- **No regression:** `useAuthSubmit` default `redirectTo='/'`; Task 6 re-runs Login/Register tests to prove it.
- **Type consistency:** `RouteDeps.requestReset(email)` / `confirmReset(token, password)` match the handler calls and the `route-deps.ts` wiring; form endpoints match the adapter paths (`/api/auth/password-reset/request|confirm`).
