# Admin login + role-gated app shell — Design

**Date:** 2026-06-16
**App:** `apps/admin` (React + Vite + TS SPA)
**Phase:** 2 — Authentication & authorization (admin line)
**Branch:** `feat/admin-auth-shell`

The first real feature in `apps/admin` (previously a bare Vite scaffold). It establishes the
foundational patterns — routing, API client, session storage, role gating — that every later
admin screen (Phases 3/5/6) builds on.

---

## 1. Scope & boundaries

### In scope
- Login page (email + password) consuming the API.
- localStorage-backed session holding the access + refresh tokens.
- An `apiClient` `fetch` wrapper that attaches `Authorization: Bearer` and transparently
  refreshes on a `401`.
- An `AuthProvider` (React Context) whose **identity and role authority is `GET /auth/me`**.
- React Router (`react-router-dom`, data router) with a `ProtectedRoute`.
- A minimal authenticated **app shell** (sidebar + header + logout + placeholder dashboard).
- Role gate: allow **`ADMIN`** and **`INVENTORY_MANAGER`**; reject **`CUSTOMER`** (→ Access Denied).

### Out of scope (later phases — do not build now)
- Any real admin feature screen (products, orders, inventory, analytics) — Phases 3/5/6.
- Role-branched navigation (admin sees X, inventory manager sees Y) — speculative until feature
  screens exist (YAGNI).
- Admin register / password-reset UI — admins are provisioned, not self-registered.
- httpOnly-cookie migration — see §6 (Phase 7 follow-up).
- Playwright E2E for `admin` — not wired in this app; see §5.

### Two small, unavoidable API touches (additive; no change to existing endpoint contracts)
1. **`enableCors()`** in `apps/api/src/main.ts` for `http://localhost:5001` and
   `http://localhost:5002`. Without it the browser blocks all cross-origin admin→API calls. We
   authenticate via the `Authorization` header (not cookies), so **no** `credentials` / CSRF
   handling is required.
2. **Seeded users** in `apps/api/prisma/seed.ts`: one `ADMIN` and one `INVENTORY_MANAGER`
   (idempotent upsert). The current seed creates no users, so login would be untestable.

---

## 2. Architecture & module layout

Approach **A** (chosen): Context + `useAuth` hook, `/auth/me`-driven, with a single `tokenStore`
choke-point and an `apiClient`. Each module has one job and is independently testable; no prop
drilling; the one risky thing (localStorage) is isolated behind a testable module that is trivial
to swap for cookies later.

```
apps/admin/src/
  lib/
    config.ts          API_BASE_URL from import.meta.env.VITE_API_URL (default http://localhost:5000)
    tokenStore.ts      THE ONLY localStorage access. get/set/clear { accessToken, refreshToken }
    apiClient.ts       fetch wrapper: attach Bearer; on 401 → refresh once → retry; else clear+throw
    types.ts           AuthUser { sub; email; role }, SessionExpiredError, ApiError
  auth/
    AuthContext.tsx    AuthProvider + useAuth(). Boots via GET /auth/me. status: loading|authed|guest
    ProtectedRoute.tsx Router element: loading→spinner; guest→/login; CUSTOMER→denied; else <Outlet/>
    roles.ts           Role union + isInternalRole() (ADMIN | INVENTORY_MANAGER)
  pages/
    LoginPage.tsx      email/password form → useAuth().login(); error display; redirect to /
    DashboardPage.tsx  placeholder landing ("Welcome, {email}") so the shell has a child
    AccessDeniedPage.tsx  shown when a CUSTOMER token reaches the app
  components/
    AppShell.tsx       layout route: sidebar + header(email + LogoutButton) + <Outlet/>
    LogoutButton.tsx   calls useAuth().logout()
  router.tsx           createBrowserRouter: /login (public) + protected shell with index dashboard
  main.tsx             (edited) wrap <RouterProvider> in <AuthProvider>
```

`App.tsx` (the scaffold placeholder) is replaced by the router + shell.

### Dependency direction (no cycles)
`config → tokenStore → apiClient → AuthContext → {ProtectedRoute, pages, components} → router → main`

Pages and components never touch `tokenStore` or raw `fetch` — only `useAuth()` and `apiClient`.

### Key contracts
- **`tokenStore`** — `get(): {accessToken, refreshToken} | null`, `set(pair)`, `clear()`. Partial
  or corrupt storage is treated as empty (and cleared).
- **`apiClient.request(path, opts)`** — attaches `Authorization: Bearer <access>`; on `401`, calls
  `POST /auth/refresh` with the stored refresh token **exactly once**, stores the rotated pair,
  retries the original request. If refresh also fails, clears `tokenStore` and throws
  `SessionExpiredError`.
- **`AuthProvider`** exposes `{ user, status, login(email, password), logout() }`.
  - `login` → `POST /auth/login` → store pair → `GET /auth/me` → set `user`.
  - `logout` → `POST /auth/logout` (revoke refresh, best-effort) → clear store → `guest`.
- **`/auth/me` is the sole authority for role.** We never decode the JWT client-side for
  authorization decisions.

### API contract consumed (already exists)
- `POST /auth/login` `{ email, password }` → `200 { accessToken, refreshToken }`; `401` generic
  `Invalid credentials` on bad creds.
- `GET /auth/me` (Bearer) → `{ sub, email, role }`, `role ∈ CUSTOMER | ADMIN | INVENTORY_MANAGER`.
- `POST /auth/refresh` `{ refreshToken }` → `200 { accessToken, refreshToken }` (rotates the
  refresh token).
- `POST /auth/logout` `{ refreshToken }` → `200 { ok: true }`.

---

## 3. Data flow & error handling

### Boot (app load / hard refresh)
```
main → AuthProvider mounts, status='loading'
  tokenStore empty?  → status='guest' (no network call)
  has token?         → GET /auth/me
      200 → set user; status='authed' (ProtectedRoute later decides shell vs denied by role)
      401 → apiClient auto-refresh → success: retry /me → set user
                                   → fail: clear store, status='guest'
```
The router does not render protected content until `status !== 'loading'`, so there is no auth flicker.

### Login
```
LoginPage submit → useAuth().login()
  POST /auth/login { email, password }
    200 → tokenStore.set → GET /auth/me → set user → navigate('/')
    401 → throw → form shows "Invalid email or password" (generic; mirrors API)
    network/500 → form shows "Something went wrong, try again"
```
A `CUSTOMER` with valid credentials logs in successfully at the API, but `ProtectedRoute` routes
them to **Access Denied** (with a logout link). We do not falsely claim their password was wrong.

### Logout
`POST /auth/logout { refreshToken }` (best-effort — proceed even on error) → `tokenStore.clear()`
→ `status='guest'` → `navigate('/login')`.

### Refresh-on-401 (the one tricky bit, in `apiClient`)
- **Single retry only** — never loops.
- **Concurrent-request guard:** if several requests `401` at once, only the first triggers
  `POST /auth/refresh`; the rest await the same in-flight refresh promise, then retry. This
  prevents a refresh-token-rotation race (the rotating refresh token would otherwise be spent
  twice → spurious logout).
- Refresh failure → clear store, throw `SessionExpiredError`; `AuthProvider` catches → `guest`.

### Edge cases (handled explicitly)
| Case | Behavior |
|---|---|
| No token in storage | `guest`, zero network calls |
| Corrupt/partial storage (e.g. refresh missing) | treat as `guest`, clear store |
| `/me` returns CUSTOMER | Access Denied page, not the shell |
| Access expired, refresh valid | transparent refresh, user never notices |
| Both expired / revoked | clean logout to `/login` |
| API unreachable on boot | `guest`; login page surfaces a non-blocking "can't reach server" note |
| Direct nav to `/` while guest | ProtectedRoute redirects to `/login` |
| Direct nav to `/login` while authed | redirect to `/` (no double-login) |

### Accessibility (hard requirement — root `CLAUDE.md` + `DESIGN.md`)
- Login form: `<label>`+`<input>` associations, `aria-invalid` + `role="alert"` on errors, focus
  moves to the error on failure, keyboard-submittable, submit disabled while pending.
- Shell: semantic `<nav>`, focus-visible states, WCAG-AA contrast.
- Colors only via DESIGN.md tokens (Tailwind theme) — no hardcoded hex.

---

## 4. Security posture & rationale

- **localStorage** holds both tokens. Chosen because the admin app is a static SPA with **no
  server** of its own, so httpOnly cookies would require re-architecting the API's auth transport
  (Set-Cookie, CORS-with-credentials, CSRF) — out of scope for a frontend shell and overlapping the
  ✅ API auth line / Phase 7. localStorage keeps this task purely frontend with the API contract
  untouched.
- **Known trade-off:** localStorage is readable by any JS on the page, so an XSS in the admin app
  could exfiltrate tokens. Accepted for an internal tool with a small trusted user base; logged as a
  Phase 7 follow-up to migrate to API-set httpOnly cookies (see §6).
- **Guardrails that keep this safe, not just convenient:**
  1. The API stays the source of truth — every protected route verifies via `GET /auth/me`; the
     stored token is only a credential to send, never a trusted source of role/identity.
  2. Single choke-point — all localStorage access goes through `tokenStore`; no scattered
     `localStorage.getItem` calls. Easy to test, trivial to swap for cookies.
  3. Refresh-on-401 + clean logout that wipes storage and revokes the refresh token server-side.

---

## 5. Testing strategy (TDD — RULE.md §4)

Red → green → refactor. Vitest + RTL (already wired in `apps/admin`). 80% target, prioritizing
auth-critical logic. No network in unit/component tests — mock `apiClient`/`fetch`; `tokenStore`
runs against jsdom's real `localStorage`.

**Unit:**
- `tokenStore.test.ts` — set/get/clear round-trip; missing key → null; partial/corrupt → empty.
- `apiClient.test.ts` — attaches Bearer; 401→refresh→retry succeeds; refresh fails → clears +
  throws `SessionExpiredError`; **concurrent 401s trigger exactly one `/auth/refresh`**; no-token
  request omits the Authorization header.
- `roles.test.ts` — `isInternalRole` accepts ADMIN/INVENTORY_MANAGER, rejects CUSTOMER.

**Component (RTL, `AuthProvider` + router with mocked `apiClient`):**
- `LoginPage.test.tsx` — accessible form; success → login + navigate; 401 → generic error in
  `role="alert"` + focus moved to it; submit disabled while pending.
- `ProtectedRoute.test.tsx` — loading→spinner; guest→redirect `/login`; CUSTOMER→Access Denied;
  ADMIN & INVENTORY_MANAGER→render `<Outlet/>`.
- `AppShell.test.tsx` — shows user email; LogoutButton → logout → redirect `/login`.
- `AuthContext.test.tsx` — boot with stored token → `/me` → authed; boot no token → guest, no
  fetch; `/me` 401 → refresh path.

**E2E:** Playwright is not wired in `apps/admin` (only `storefront`). Not added in this slice
(separate setup, out of scope). Logged as a follow-up.

**Manual smoke (RULE.md §5 — tests mock the API and can't prove real login):**
Run API on `:5000` + admin on `:5002`, then verify against `ecom_dev`:
1. Log in as the seeded `ADMIN` → shell renders, dashboard shows email.
2. Hard refresh → session persists (boot `/me` path).
3. Logout → store cleared, back to `/login`; re-visiting `/` redirects to `/login`.
4. Log in as the seeded `INVENTORY_MANAGER` → shell renders (role allowed).
5. Log in as a `CUSTOMER` → Access Denied page.
6. Bad credentials → generic error, focus on alert.

**Verification gate before "done":** `npm test` green · `npm run lint` clean · `npm run build`
(tsc + vite) clean · manual smoke above passes.

---

## 6. Follow-ups (not this slice)
- **Phase 7:** migrate admin session from localStorage to API-set httpOnly cookies (Set-Cookie on
  login/refresh/logout, CORS-with-credentials for `:5002`, CSRF protection). Consider aligning the
  storefront and admin on one cookie-based mechanism.
- Wire Playwright E2E for `apps/admin` (mirror the storefront harness).
- Tighten the API `enableCors` origin list from env / per-environment config during Phase 7
  hardening.

---

## 7. Decisions locked (for traceability)
- **Token storage:** localStorage behind a single `tokenStore`; `/auth/me` is the role authority.
- **Role gate:** allow ADMIN + INVENTORY_MANAGER; reject CUSTOMER. No role-branched UI yet.
- **Router:** `react-router-dom` data router (`createBrowserRouter`) with `ProtectedRoute`.
- **Auth state:** Context + `useAuth` (Approach A) — no state library (YAGNI), no prop drilling.
- **API touches:** additive `enableCors()` + idempotent seed users only.
