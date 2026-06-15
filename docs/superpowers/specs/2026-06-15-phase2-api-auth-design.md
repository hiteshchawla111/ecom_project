# Phase 2 — Slice 1: API Authentication & Authorization Core

**Date:** 2026-06-15
**Status:** Approved — ready for implementation plan
**Scope:** `apps/api` only. Storefront and admin auth are later slices (gated on closing the Phase 0 frontend-test-runner gap).

Derived from PRD Phase 2 (`PLAN.md`) and the API guidance in `apps/api/CLAUDE.md`. Built test-first per `RULE.md` §4 (red → green → refactor, 80% coverage target on this domain-critical logic).

---

## Goal

Provide the authentication and authorization foundation both frontends depend on:
customer registration, login, logout, token refresh, password-reset (token endpoints only — no
email yet), and role-based route guards (Customer / Admin / Inventory Manager). Authorization is
enforced here and never trusted from a client.

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| First slice | API auth core only — stop and verify before any frontend |
| Token strategy | JWT access (~15m) + refresh (~7d), refresh rotated on use |
| Password reset | Token endpoints now; email delivery deferred to Phase 6 notifications |
| Token storage | New `RefreshToken` + `PasswordResetToken` models via Prisma migration |
| Libraries | `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt` + `bcrypt` |

## Architecture

Self-contained `AuthModule` following the existing thin-controller / service-logic pattern.

```
src/auth/
  auth.module.ts                       wires JwtModule, PassportModule, providers, guards
  auth.controller.ts                   thin HTTP layer
  auth.service.ts                      register, login, refresh, logout, reset orchestration
  token.service.ts                     sign/verify access+refresh; persist, rotate, revoke refresh tokens
  password.service.ts                  bcrypt hash/compare (passwords + token hashing)
  dto/
    register.dto.ts                    RegisterDto
    login.dto.ts                       LoginDto
    refresh.dto.ts                     RefreshDto
    request-reset.dto.ts               RequestResetDto
    confirm-reset.dto.ts               ConfirmResetDto
  strategies/jwt.strategy.ts           validates access token -> req.user
  guards/jwt-auth.guard.ts             authentication (global, opt-out via @Public)
  guards/roles.guard.ts                authorization (reads @Roles metadata)
  decorators/roles.decorator.ts        @Roles(Role.ADMIN, ...)
  decorators/current-user.decorator.ts @CurrentUser()
  decorators/public.decorator.ts       @Public()
```

**New dependencies:** `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcrypt`
(+ dev `@types/passport-jwt`, `@types/bcrypt`).

**Config** (via `@nestjs/config`, added to `apps/api/.env` and `.env.example`):
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL` (default `15m`), `JWT_REFRESH_TTL` (default `7d`),
`PASSWORD_RESET_TTL` (default `1h`).

## Data model — Prisma migration `add_auth_tokens`

Applied to `ecom_dev` (shadow `ecom_shadow`). The pre-existing `ecomm` DB is left untouched.

```prisma
model RefreshToken {
  id        String    @id @default(cuid())
  tokenHash String    @unique           // store hash, never the raw token
  user      User      @relation(fields: [userId], references: [id])
  userId    String
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}

model PasswordResetToken {
  id        String    @id @default(cuid())
  tokenHash String    @unique
  user      User      @relation(fields: [userId], references: [id])
  userId    String
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}
```

Add back-relations `refreshTokens RefreshToken[]` and `passwordResetTokens PasswordResetToken[]` to `User`.

## Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | create CUSTOMER, return access+refresh |
| POST | `/auth/login` | public | verify creds, issue access+refresh |
| POST | `/auth/refresh` | public (refresh token in body) | rotate refresh, return new access+refresh |
| POST | `/auth/logout` | bearer | revoke the presented refresh token |
| GET  | `/auth/me` | bearer | current user's profile |
| POST | `/auth/password-reset/request` | public | create reset token; emit domain-event placeholder (no email) |
| POST | `/auth/password-reset/confirm` | public | consume token, set new password, revoke all refresh tokens |

## Key rules

- **Registration is CUSTOMER-only.** Role is forced server-side; the field is not accepted from the
  request body. Admin / Inventory-Manager accounts are provisioned by seed or by an admin, never via
  public registration (privilege-escalation guard).
- **Tokens hashed at rest.** Raw refresh/reset tokens are returned to the client once and stored only
  as bcrypt hashes. Refresh **rotates** on every use: the prior token is revoked; presenting a revoked
  or already-rotated token is rejected.
- **Password reset is non-enumerating.** `request` always returns `200` regardless of whether the email
  exists. `confirm` revokes all of the user's refresh tokens after a successful password change.
- **Guards.** `JwtAuthGuard` is registered globally and opted out per-route with `@Public()`.
  `RolesGuard` enforces `@Roles(...)`. Authorization lives only in the API.
- **Account state.** Inactive (`isActive = false`) or soft-deleted (`deletedAt != null`) users are
  rejected at login and inside the JWT strategy.

## Error handling

- **Validation** — global `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`); malformed
  input → `400`. Email normalized (trim + lowercase) before lookup.
- **Auth failures** — `401` for bad credentials, expired/invalid/revoked tokens, inactive/deleted user.
  Login returns the **same** generic message for unknown-email and wrong-password (no user enumeration).
- **Conflicts** — duplicate email on register → `409`, mapped from Prisma `P2002` and rethrown as a clean
  Nest `ConflictException`.
- **Password reset** — `request` always `200`; `confirm` with invalid/expired/used token → `400` with an
  opaque message.
- **Authorization** — missing/insufficient role → `403` from `RolesGuard`.
- All errors are `HttpException` subclasses so the framework renders consistent JSON.

## Test plan (TDD order; Jest, mirrors existing `*.spec.ts` convention)

Unit tests with Prisma mocked:

1. **`password.service.spec`** — hash ≠ plaintext; `compare` returns true for match, false otherwise.
2. **`token.service.spec`** — sign/verify access & refresh; reject tampered/expired; refresh persisted as
   hash; rotation revokes prior; revoked-token reuse rejected.
3. **`auth.service.spec`** — register (success; duplicate → 409; forces CUSTOMER role); login (success;
   wrong-pw → 401; unknown-email → 401 same message; inactive/deleted → 401); refresh (rotate; reuse → 401);
   logout (revokes); reset request (always ok; token created); reset confirm (sets pw; revokes tokens;
   invalid/expired/used → 400).
4. **`roles.guard.spec`** — allows matching role; `403` on mismatch; respects `@Public()`.
5. **`jwt.strategy.spec`** — valid payload → user; inactive/deleted/missing user → reject.

**Coverage:** 80% target, prioritizing this auth logic (`RULE.md` §4).
**Follow-up:** HTTP-level E2E tests are deferred with the open Phase 0 frontend-test-runner gap; the
existing Jest unit setup is what's wired today.

## Out of scope (this slice)

Storefront/admin auth UI, email delivery for reset, OAuth/social login, 2FA, rate limiting (revisited in
Phase 7 hardening). These follow in later slices.
