# Storefront — Password-Reset UI & Guest Route Guard

**Date:** 2026-06-15
**App:** `apps/storefront` (Next.js, App Router)
**Phase:** 2 — Authentication & authorization (storefront follow-up)
**Status:** Design approved — ready for implementation plan

## Summary

Close out the storefront auth surface with two related changes:

1. **Password-reset UI** — a *request* page (`/forgot-password`) and a *confirm* page (`/reset-password?token=...`), wiring to the API's existing reset endpoints.
2. **Guest route guard** — prevent logged-in users from reaching auth pages (`/login`, `/register`, `/forgot-password`, `/reset-password`); redirect them to `/`.

No new infrastructure: everything reuses the established storefront auth patterns (route handlers with injectable `RouteDeps`, thin `route.ts` adapters, the `(auth)` card layout, `fields.tsx`, and the proxy/pure-guard split).

## Context — what already exists

- **API contract** (`apps/api/src/auth`):
  - `POST /auth/password-reset/request` `{ email }` → always `{ ok: true }` (**enumeration-safe**: same response whether or not the account exists).
  - `POST /auth/password-reset/confirm` `{ token, password }` (password min 8) → `{ ok: true }`, or `400 "Invalid or expired reset token"`. On success the API revokes **all** of the user's sessions.
  - Email delivery of the reset link is **deferred to Phase 6**; the token is generated server-side and stored hashed.
- **API client** (`src/lib/api-auth.ts`): `requestReset(email, opts)` and `confirmReset(token, password, opts)` already implemented.
- **Route-handler pattern**: `handlers.ts` (pure, injectable `RouteDeps`) + `route-deps.ts` (live wiring) + thin `route.ts` adapters under `src/app/api/auth/*`.
- **Proxy guard**: `src/proxy.ts` (Next 16 middleware) + pure `src/lib/route-protection.ts` (`isProtected`, `loginRedirectFor`). Cookie-presence guard; the page re-verifies via the API (defense in depth).
- **UI primitives**: `(auth)/layout.tsx` (centered card), `components/auth/fields.tsx` (`TextField`, `FormError`, `SubmitButton`), `useAuthSubmit` hook.

## Decisions (from brainstorming)

- **Guest guard** lives in `proxy.ts`; redirects logged-in users to **`/`** (consistent with where `useAuthSubmit` pushes after login/register).
- **Reset token** is read from the **`?token=`** query param (production-correct contract — the shape a real reset email link will use). Missing param → render an "invalid or expired link" message, not the form.
- **Success flow**: both reset pages **redirect to `/login`** on success. Request page stays enumeration-safe (no "user not found" leak).

## Architecture

Three bounded pieces, each mirroring an existing pattern.

### 1. Guest guard (routing)

**`src/lib/route-protection.ts`** — add, as pure/testable siblings of the existing helpers:

- `AUTH_PREFIXES = ['/login', '/register', '/forgot-password', '/reset-password']`
- `isAuthRoute(pathname): boolean`
- `guestRedirectFor(pathname, hasSession): string | null` → returns `'/'` when `isAuthRoute(pathname) && hasSession`, else `null`.

**`src/proxy.ts`** — compute `hasSession` once (cookie presence), then:

```ts
const target = loginRedirectFor(pathname, hasSession) ?? guestRedirectFor(pathname, hasSession);
```

Widen `matcher` to `['/account/:path*', '/login', '/register', '/forgot-password', '/reset-password']`.

Guard is cookie-presence only — fast, runs pre-render, consistent with the existing protected-route guard. Session validity is still verified by the API on the pages that need it.

### 2. Route handlers & adapters

**`src/app/api/auth/handlers.ts`** — extend `RouteDeps`:

```ts
requestReset(email: string): Promise<{ ok: true }>;
confirmReset(token: string, password: string): Promise<{ ok: true }>;
```

Add two handlers:

- `handleRequestReset(input, deps)` — trim `email`; if empty → `400` (local guard). Otherwise call `deps.requestReset(email)` and return `{ status: 200, body: { ok: true } }`. A valid-shaped but non-existent email still returns `200` (the API is enumeration-safe). `ApiAuthError` maps via the existing `fromApiError`.
- `handleConfirmReset(input, deps)` — require `token` non-empty and `password.length >= 8` (matches the API DTO); otherwise `400` locally (no API call). Otherwise call `deps.confirmReset(token, password)`; map the API's `400 "Invalid or expired reset token"` through `fromApiError`.

**`src/app/api/auth/route-deps.ts`** — wire the two new deps to the existing `api-auth` client functions (alias the imports to avoid clashing with the dep keys):

```ts
requestReset: (email) => apiRequestReset(email, { baseUrl }),
confirmReset: (token, password) => apiConfirmReset(token, password, { baseUrl }),
```

**Adapters** (thin, identical in shape to `login/route.ts`):

- `src/app/api/auth/password-reset/request/route.ts`
- `src/app/api/auth/password-reset/confirm/route.ts`

### 3. Pages & client forms

**`src/components/auth/useAuthSubmit.ts`** — minimal, backward-compatible generalization: accept an options arg `{ redirectTo?: string }` defaulting to `'/'` (login/register unchanged). Reset forms pass `redirectTo: '/login'`.

**`src/components/auth/ForgotPasswordForm.tsx`** (`'use client'`) — one email `TextField` + `SubmitButton`, posts to `/api/auth/password-reset/request`, `redirectTo: '/login'`. Enumeration-safe: success just redirects.

**`src/components/auth/ResetPasswordForm.tsx`** (`'use client'`, prop `token: string`) — two password fields (new + confirm), `autoComplete="new-password"`. Client-side checks before any fetch: both filled, min 8 chars, and they match (mismatch surfaced inline via `FormError`). Posts `{ token, password }` to `/api/auth/password-reset/confirm`, `redirectTo: '/login'`. If `token` is empty, render an "invalid or expired link" message + link to `/forgot-password` instead of the form.

**Pages** (reuse `(auth)` card layout):

- `src/app/(auth)/forgot-password/page.tsx` — header + helper text, `<ForgotPasswordForm />`, "Back to sign in" link. `metadata.title = 'Reset password'`.
- `src/app/(auth)/reset-password/page.tsx` — server component reads `searchParams.token`, renders `<ResetPasswordForm token={token} />`. `metadata.title = 'Set a new password'`.

**Link wiring**: add a "Forgot password?" link on the login page → `/forgot-password`.

**Accessibility**: labelled inputs, `role="alert"` error region (existing `FormError`), explicit client validation with `noValidate`, correct `autoComplete` values.

## Testing (TDD — red → green → refactor)

- **`route-protection.test.ts`** (extend): `guestRedirectFor` → `/` for each auth route when `hasSession`, `null` otherwise and for non-auth routes; `isAuthRoute` matches the four prefixes, rejects `/` and `/account`; assert `loginRedirectFor` unchanged (no regression).
- **`handlers.test.ts`** (extend): `handleRequestReset` — happy path `200 {ok:true}` + trimmed email passed to dep; empty email → `400`; valid-but-nonexistent email still `200`; `ApiAuthError` maps. `handleConfirmReset` — happy path `200`; missing token → `400`; password < 8 → `400` (no API call); API `400` maps through.
- **Component tests**: `ForgotPasswordForm.test.tsx` (submits email; error on failed fetch). `ResetPasswordForm.test.tsx` (password mismatch shown inline without fetch; min-length enforced; missing-token renders invalid-link message not the form; successful submit calls fetch + redirect). Mock `fetch` + `next/navigation`.
- **`api-auth.test.ts`**: verify `requestReset`/`confirmReset` hit the right paths/bodies — *check existing coverage first, add only what's missing*.
- **Playwright E2E** (`e2e/`): `/forgot-password` renders and a valid email submit redirects to `/login`; `/reset-password` with no `?token=` shows the invalid-link message; **guest guard** — a logged-in session visiting `/login` redirects to `/`.

## Verification before "done" (RULE.md §5)

1. `npm test` (Vitest) green.
2. `npm run lint` clean.
3. `npm run build` succeeds.
4. **Manual smoke run** against the live API on `:5000` / DB `ecom_dev`:
   - Request a reset for a seeded user → `200`.
   - Pull the generated token from `ecom_dev` (`passwordResetToken`), hit `/reset-password?token=...`, set a new password → redirected to `/login`.
   - Log in with the new password → succeeds; the old refresh session is revoked.
   - Logged-in browser session visiting `/login` / `/register` / `/forgot-password` → redirected to `/`.

The token-confirm happy path depends on a real DB token, so it is **smoke-verified manually** rather than via an E2E DB fixture (noted, not silently skipped).

## Risks / considerations

- **Enumeration safety** must be preserved end-to-end: the request handler never reveals whether an email exists. Don't add a "no account found" error path.
- **`useAuthSubmit` change** touches login/register — keep the default `redirectTo: '/'` so existing behavior and tests are unaffected.
- **Proxy matcher** widening: ensure the four auth routes are matched exactly (not as prefixes that could catch unintended paths). `isAuthRoute` uses exact/segment matching like `isProtected`.
- **TOCTOU** on token claim is a known API-side `TODO(phase-7)` — out of scope here.

## Out of scope

- Email delivery of reset links (Phase 6).
- Admin login / role-gated shell (next Phase 2 slice).
- Atomic token-claim hardening (API Phase 7).
