# Admin Login + Role-Gated App Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add login + a role-gated authenticated shell to `apps/admin`, with localStorage-backed session and `/auth/me` as the role authority.

**Architecture:** Static React+Vite SPA. A single `tokenStore` wraps localStorage; an `apiClient` attaches `Authorization: Bearer` and refreshes once on 401 (concurrency-guarded); `AuthProvider` (Context) boots from `GET /auth/me` and is the sole role authority; `react-router-dom` data router gates protected routes via `ProtectedRoute`. Two additive API touches: `enableCors()` + idempotent seed users.

**Tech Stack:** React 19, Vite 8, TypeScript, react-router-dom v7, Tailwind v4 (DESIGN.md tokens), Vitest + RTL. Backend: NestJS (`apps/api`), Prisma 7, bcrypt.

**Spec:** `docs/superpowers/specs/2026-06-16-admin-auth-shell-design.md`
**Branch:** `feat/admin-auth-shell`

---

## File Structure

**API (additive):**
- Modify: `apps/api/src/main.ts` — add `app.enableCors(...)`.
- Modify: `apps/api/prisma/seed.ts` — idempotently upsert an ADMIN + an INVENTORY_MANAGER user.

**Admin (new):**
- `apps/admin/src/lib/config.ts` — `API_BASE_URL`.
- `apps/admin/src/lib/types.ts` — `Role`, `AuthUser`, `TokenPair`, `SessionExpiredError`, `ApiError`.
- `apps/admin/src/lib/tokenStore.ts` — only localStorage access.
- `apps/admin/src/lib/apiClient.ts` — fetch wrapper + refresh-on-401.
- `apps/admin/src/auth/roles.ts` — `isInternalRole`.
- `apps/admin/src/auth/AuthContext.tsx` — `AuthProvider` + `useAuth`.
- `apps/admin/src/auth/ProtectedRoute.tsx` — route gate.
- `apps/admin/src/pages/LoginPage.tsx`, `DashboardPage.tsx`, `AccessDeniedPage.tsx`.
- `apps/admin/src/components/AppShell.tsx`, `LogoutButton.tsx`.
- `apps/admin/src/router.tsx` — `createBrowserRouter`.
- Modify: `apps/admin/src/main.tsx` — mount `RouterProvider` inside `AuthProvider`.
- Delete: `apps/admin/src/App.tsx`, `apps/admin/src/App.test.tsx`, `apps/admin/src/App.css` (scaffold placeholders).
- `.env.example` / `.env.local` for `VITE_API_URL`.

Build order: API touches → admin install dep → types/config → tokenStore → apiClient → roles → AuthContext → ProtectedRoute → pages → shell → router/main → wire-up & smoke.

---

## Task 1: API — enable CORS for the frontends

**Files:**
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Add `enableCors` to bootstrap**

Edit `apps/api/src/main.ts` — after `const app = await NestFactory.create(AppModule);` add:

```typescript
  app.enableCors({
    origin: ['http://localhost:5001', 'http://localhost:5002'],
  });
```

(Bearer-header auth, so no `credentials: true` / CSRF needed. Origins = storefront + admin dev ports.)

- [ ] **Step 2: Verify it compiles**

Run: `npm --prefix apps/api run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/main.ts
git commit -m "feat(api): enable CORS for storefront and admin dev origins"
```

---

## Task 2: API — seed an ADMIN and INVENTORY_MANAGER user

**Files:**
- Modify: `apps/api/prisma/seed.ts`

- [ ] **Step 1: Add bcrypt import + user upserts**

In `apps/api/prisma/seed.ts`, add to the imports at top:

```typescript
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
```

Then inside `main()`, before the `console.log('Seed complete.')` line, add:

```typescript
  // Dev users for each internal role (idempotent). Password: "Password123!".
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const devUsers = [
    { email: 'admin@example.com', name: 'Admin User', role: Role.ADMIN },
    {
      email: 'inventory@example.com',
      name: 'Inventory Manager',
      role: Role.INVENTORY_MANAGER,
    },
  ];
  for (const u of devUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash,
      },
    });
  }
```

- [ ] **Step 2: Run the seed against `ecom_dev`**

Run: `npm --prefix apps/api run build && npx --prefix apps/api prisma db seed`
(If `prisma db seed` needs cwd, run from `apps/api`: `cd apps/api && npx prisma db seed`.)
Expected: "Seed complete." and no errors. Re-running is safe (upsert).

- [ ] **Step 3: Verify the users exist**

Run: `cd apps/api && npx prisma studio` (or a quick query) — confirm `admin@example.com` (ADMIN) and `inventory@example.com` (INVENTORY_MANAGER) exist.
Expected: both present with the correct roles.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/seed.ts
git commit -m "feat(api): seed ADMIN and INVENTORY_MANAGER dev users"
```

---

## Task 3: Admin — install router + env config

**Files:**
- Modify: `apps/admin/package.json` (via install)
- Create: `apps/admin/.env.example`, `apps/admin/.env.local`
- Create: `apps/admin/src/lib/config.ts`

- [ ] **Step 1: Install react-router-dom**

Run: `npm --prefix apps/admin install react-router-dom`
Expected: dependency added; no errors.

- [ ] **Step 2: Create env files**

Create `apps/admin/.env.example`:

```
# Base URL of the API the admin SPA talks to.
VITE_API_URL=http://localhost:5000
```

Create `apps/admin/.env.local` (gitignored) with the same content:

```
VITE_API_URL=http://localhost:5000
```

- [ ] **Step 3: Create `config.ts`**

Create `apps/admin/src/lib/config.ts`:

```typescript
/** Base URL of the API. Configurable via VITE_API_URL; defaults to the dev port. */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL ?? 'http://localhost:5000';
```

- [ ] **Step 4: Verify build**

Run: `npm --prefix apps/admin run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/package.json apps/admin/package-lock.json apps/admin/.env.example apps/admin/src/lib/config.ts
git commit -m "chore(admin): add react-router-dom and API base URL config"
```

(Note: `.env.local` is gitignored — do not add it.)

---

## Task 4: Admin — shared types

**Files:**
- Create: `apps/admin/src/lib/types.ts`

- [ ] **Step 1: Create `types.ts`**

```typescript
/** Roles mirror the API's Prisma Role enum. */
export type Role = 'CUSTOMER' | 'ADMIN' | 'INVENTORY_MANAGER';

/** Authenticated user, as returned by GET /auth/me. */
export interface AuthUser {
  sub: string;
  email: string;
  role: Role;
}

/** Access + refresh token pair, as returned by login/refresh. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Thrown when the session can no longer be refreshed. */
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired');
    this.name = 'SessionExpiredError';
  }
}

/** Thrown for non-OK API responses (other than the handled 401-refresh path). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm --prefix apps/admin run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/lib/types.ts
git commit -m "feat(admin): add auth domain types"
```

---

## Task 5: Admin — tokenStore (TDD)

**Files:**
- Create: `apps/admin/src/lib/tokenStore.ts`
- Test: `apps/admin/src/lib/tokenStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/lib/tokenStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { tokenStore } from './tokenStore';

describe('tokenStore', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when nothing is stored', () => {
    expect(tokenStore.get()).toBeNull();
  });

  it('round-trips a token pair', () => {
    tokenStore.set({ accessToken: 'a', refreshToken: 'r' });
    expect(tokenStore.get()).toEqual({ accessToken: 'a', refreshToken: 'r' });
  });

  it('clears stored tokens', () => {
    tokenStore.set({ accessToken: 'a', refreshToken: 'r' });
    tokenStore.clear();
    expect(tokenStore.get()).toBeNull();
  });

  it('treats partial/corrupt storage as empty and clears it', () => {
    localStorage.setItem('admin.auth', '{"accessToken":"a"}'); // missing refreshToken
    expect(tokenStore.get()).toBeNull();
    expect(localStorage.getItem('admin.auth')).toBeNull();
  });

  it('treats unparseable storage as empty', () => {
    localStorage.setItem('admin.auth', 'not json');
    expect(tokenStore.get()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/admin test -- tokenStore`
Expected: FAIL — cannot resolve `./tokenStore`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/admin/src/lib/tokenStore.ts`:

```typescript
import type { TokenPair } from './types';

const KEY = 'admin.auth';

/** The single point of localStorage access for the session token pair. */
export const tokenStore = {
  get(): TokenPair | null {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<TokenPair>;
      if (
        typeof parsed.accessToken === 'string' &&
        typeof parsed.refreshToken === 'string'
      ) {
        return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
      }
    } catch {
      // fall through to clear + null
    }
    localStorage.removeItem(KEY);
    return null;
  },

  set(pair: TokenPair): void {
    localStorage.setItem(KEY, JSON.stringify(pair));
  },

  clear(): void {
    localStorage.removeItem(KEY);
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/admin test -- tokenStore`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/lib/tokenStore.ts apps/admin/src/lib/tokenStore.test.ts
git commit -m "feat(admin): add tokenStore over localStorage (TDD)"
```

---

## Task 6: Admin — apiClient with refresh-on-401 (TDD)

**Files:**
- Create: `apps/admin/src/lib/apiClient.ts`
- Test: `apps/admin/src/lib/apiClient.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/lib/apiClient.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { apiClient } from './apiClient';
import { tokenStore } from './tokenStore';
import { SessionExpiredError } from './types';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiClient', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('omits Authorization header when no token is stored', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ ok: true }));
    await apiClient.request('/health');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('attaches Bearer access token', async () => {
    tokenStore.set({ accessToken: 'AT', refreshToken: 'RT' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ ok: true }));
    await apiClient.request('/auth/me');
    const headers = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get('Authorization')).toBe('Bearer AT');
  });

  it('on 401 refreshes once, stores the new pair, and retries', async () => {
    tokenStore.set({ accessToken: 'old', refreshToken: 'oldR' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}, 401)) // original request
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: 'new', refreshToken: 'newR' }), // /auth/refresh
      )
      .mockResolvedValueOnce(jsonResponse({ data: 1 })); // retry
    const result = await apiClient.request<{ data: number }>('/auth/me');
    expect(result).toEqual({ data: 1 });
    expect(tokenStore.get()).toEqual({ accessToken: 'new', refreshToken: 'newR' });
    // retry used the new token
    const retryHeaders = new Headers((fetchMock.mock.calls[2][1] as RequestInit).headers);
    expect(retryHeaders.get('Authorization')).toBe('Bearer new');
  });

  it('clears store and throws SessionExpiredError when refresh fails', async () => {
    tokenStore.set({ accessToken: 'old', refreshToken: 'oldR' });
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}, 401)) // original
      .mockResolvedValueOnce(jsonResponse({}, 401)); // refresh fails
    await expect(apiClient.request('/auth/me')).rejects.toBeInstanceOf(SessionExpiredError);
    expect(tokenStore.get()).toBeNull();
  });

  it('concurrent 401s trigger exactly one /auth/refresh', async () => {
    tokenStore.set({ accessToken: 'old', refreshToken: 'oldR' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(jsonResponse({ accessToken: 'new', refreshToken: 'newR' }));
      }
      // first call for each path 401s once, then succeeds
      return Promise.resolve(jsonResponse({}, 401));
    });
    // Two requests racing; both 401, both should await the single refresh.
    // Make the post-refresh retry succeed by switching the mock after first refresh.
    let refreshed = false;
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        refreshed = true;
        return Promise.resolve(jsonResponse({ accessToken: 'new', refreshToken: 'newR' }));
      }
      if (!refreshed) return Promise.resolve(jsonResponse({}, 401));
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    await Promise.all([apiClient.request('/a'), apiClient.request('/b')]);
    const refreshCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).endsWith('/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/admin test -- apiClient`
Expected: FAIL — cannot resolve `./apiClient`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/admin/src/lib/apiClient.ts`:

```typescript
import { API_BASE_URL } from './config';
import { tokenStore } from './tokenStore';
import { ApiError, SessionExpiredError, type TokenPair } from './types';

/** Shared in-flight refresh so concurrent 401s only refresh once. */
let refreshInFlight: Promise<TokenPair> | null = null;

async function doRefresh(): Promise<TokenPair> {
  const current = tokenStore.get();
  if (!current) throw new SessionExpiredError();
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: current.refreshToken }),
  });
  if (!res.ok) {
    tokenStore.clear();
    throw new SessionExpiredError();
  }
  const pair = (await res.json()) as TokenPair;
  tokenStore.set(pair);
  return pair;
}

function refreshOnce(): Promise<TokenPair> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function buildHeaders(accessToken: string | undefined, init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return headers;
}

async function rawFetch(path: string, init: RequestInit | undefined, token?: string) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: buildHeaders(token, init),
  });
}

export const apiClient = {
  async request<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    const tokens = tokenStore.get();
    let res = await rawFetch(path, init, tokens?.accessToken);

    if (res.status === 401 && tokens) {
      const refreshed = await refreshOnce(); // throws SessionExpiredError if it fails
      res = await rawFetch(path, init, refreshed.accessToken);
    }

    if (!res.ok) {
      throw new ApiError(res.status, `Request to ${path} failed (${res.status})`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/admin test -- apiClient`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/lib/apiClient.ts apps/admin/src/lib/apiClient.test.ts
git commit -m "feat(admin): add apiClient with concurrency-guarded refresh-on-401 (TDD)"
```

---

## Task 7: Admin — roles helper (TDD)

**Files:**
- Create: `apps/admin/src/auth/roles.ts`
- Test: `apps/admin/src/auth/roles.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/auth/roles.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isInternalRole } from './roles';

describe('isInternalRole', () => {
  it('accepts ADMIN', () => expect(isInternalRole('ADMIN')).toBe(true));
  it('accepts INVENTORY_MANAGER', () =>
    expect(isInternalRole('INVENTORY_MANAGER')).toBe(true));
  it('rejects CUSTOMER', () => expect(isInternalRole('CUSTOMER')).toBe(false));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/admin test -- roles`
Expected: FAIL — cannot resolve `./roles`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/admin/src/auth/roles.ts`:

```typescript
import type { Role } from '../lib/types';

/** Roles permitted into the admin shell. CUSTOMER is rejected. */
const INTERNAL_ROLES: ReadonlySet<Role> = new Set<Role>(['ADMIN', 'INVENTORY_MANAGER']);

export function isInternalRole(role: Role): boolean {
  return INTERNAL_ROLES.has(role);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/admin test -- roles`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/auth/roles.ts apps/admin/src/auth/roles.test.ts
git commit -m "feat(admin): add isInternalRole helper (TDD)"
```

---

## Task 8: Admin — AuthProvider + useAuth (TDD)

**Files:**
- Create: `apps/admin/src/auth/AuthContext.tsx`
- Test: `apps/admin/src/auth/AuthContext.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/auth/AuthContext.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { tokenStore } from '../lib/tokenStore';
import { apiClient } from '../lib/apiClient';
import type { AuthUser } from '../lib/types';

vi.mock('../lib/apiClient', () => ({
  apiClient: { request: vi.fn() },
}));

const mockedRequest = vi.mocked(apiClient.request);

function Probe() {
  const { status, user } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{user?.email ?? ''}</span>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('boots to guest with no token and makes no /me call', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('guest'));
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('boots to authed when a stored token resolves via /auth/me', async () => {
    tokenStore.set({ accessToken: 'AT', refreshToken: 'RT' });
    const user: AuthUser = { sub: '1', email: 'admin@example.com', role: 'ADMIN' };
    mockedRequest.mockResolvedValueOnce(user);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authed'));
    expect(screen.getByTestId('email').textContent).toBe('admin@example.com');
    expect(mockedRequest).toHaveBeenCalledWith('/auth/me');
  });

  it('boots to guest when /auth/me rejects', async () => {
    tokenStore.set({ accessToken: 'AT', refreshToken: 'RT' });
    mockedRequest.mockRejectedValueOnce(new Error('expired'));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('guest'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/admin test -- AuthContext`
Expected: FAIL — cannot resolve `./AuthContext`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/admin/src/auth/AuthContext.tsx`:

```typescript
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiClient } from '../lib/apiClient';
import { tokenStore } from '../lib/tokenStore';
import type { AuthUser, TokenPair } from '../lib/types';

type AuthStatus = 'loading' | 'authed' | 'guest';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  // Boot: resolve identity from a stored token, if any.
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!tokenStore.get()) {
        if (!cancelled) setStatus('guest');
        return;
      }
      try {
        const me = await apiClient.request<AuthUser>('/auth/me');
        if (cancelled) return;
        setUser(me);
        setStatus('authed');
      } catch {
        if (cancelled) return;
        tokenStore.clear();
        setUser(null);
        setStatus('guest');
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const pair = await apiClient.request<TokenPair>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    tokenStore.set(pair);
    const me = await apiClient.request<AuthUser>('/auth/me');
    setUser(me);
    setStatus('authed');
  }, []);

  const logout = useCallback(async () => {
    const tokens = tokenStore.get();
    if (tokens) {
      try {
        await apiClient.request('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
      } catch {
        // best-effort: revoke server-side if we can, but always clear locally
      }
    }
    tokenStore.clear();
    setUser(null);
    setStatus('guest');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout }),
    [status, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/admin test -- AuthContext`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/auth/AuthContext.tsx apps/admin/src/auth/AuthContext.test.tsx
git commit -m "feat(admin): add AuthProvider + useAuth, /auth/me as authority (TDD)"
```

---

## Task 9: Admin — placeholder pages + shell components

These are presentational; they are exercised by the route/shell tests in Tasks 10–11. Build them first so those tests can import real components.

**Files:**
- Create: `apps/admin/src/pages/DashboardPage.tsx`
- Create: `apps/admin/src/pages/AccessDeniedPage.tsx`
- Create: `apps/admin/src/components/LogoutButton.tsx`
- Create: `apps/admin/src/components/AppShell.tsx`

- [ ] **Step 1: Create `LogoutButton.tsx`**

```typescript
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function LogoutButton() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function onClick() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-primary-500"
    >
      Sign out
    </button>
  );
}
```

- [ ] **Step 2: Create `AppShell.tsx`**

```typescript
import { Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LogoutButton } from './LogoutButton';

export function AppShell() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-neutral-200 bg-neutral-0 p-4">
        <h1 className="font-heading text-lg font-semibold text-neutral-900">Admin</h1>
        <nav aria-label="Main" className="mt-6 flex flex-col gap-1 text-sm">
          <span className="rounded-md bg-neutral-100 px-3 py-2 font-medium text-neutral-900">
            Dashboard
          </span>
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-3">
          <span className="text-sm text-neutral-600" data-testid="current-user">
            {user?.email}
          </span>
          <LogoutButton />
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `DashboardPage.tsx`**

```typescript
import { useAuth } from '../auth/AuthContext';

export function DashboardPage() {
  const { user } = useAuth();
  return (
    <section>
      <h2 className="font-heading text-2xl font-semibold text-neutral-900">Dashboard</h2>
      <p className="mt-2 text-neutral-600">Welcome, {user?.email}.</p>
    </section>
  );
}
```

- [ ] **Step 4: Create `AccessDeniedPage.tsx`**

```typescript
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function AccessDeniedPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function onSignOut() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-heading text-2xl font-semibold text-neutral-900">Access denied</h1>
      <p className="max-w-md text-neutral-600">
        Your account doesn’t have permission to use the admin panel.
      </p>
      <button
        type="button"
        onClick={onSignOut}
        className="rounded-md bg-primary-500 px-4 py-2 font-medium text-white transition-colors hover:bg-primary-600"
      >
        Sign out
      </button>
    </main>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `npm --prefix apps/admin run build`
Expected: build succeeds (these compile against the existing AuthContext + react-router-dom).

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/pages apps/admin/src/components
git commit -m "feat(admin): add shell, dashboard, access-denied, logout components"
```

---

## Task 10: Admin — ProtectedRoute (TDD)

**Files:**
- Create: `apps/admin/src/auth/ProtectedRoute.tsx`
- Test: `apps/admin/src/auth/ProtectedRoute.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/auth/ProtectedRoute.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { ProtectedRoute } from './ProtectedRoute';
import { tokenStore } from '../lib/tokenStore';
import { apiClient } from '../lib/apiClient';
import type { AuthUser, Role } from '../lib/types';

vi.mock('../lib/apiClient', () => ({ apiClient: { request: vi.fn() } }));
const mockedRequest = vi.mocked(apiClient.request);

function renderAt(initial = '/') {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <div>LOGIN PAGE</div> },
      {
        element: <ProtectedRoute />,
        children: [{ path: '/', element: <div>SHELL CONTENT</div> }],
      },
    ],
    { initialEntries: [initial] },
  );
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

function bootAs(role: Role) {
  tokenStore.set({ accessToken: 'AT', refreshToken: 'RT' });
  const user: AuthUser = { sub: '1', email: `${role}@x.com`, role };
  mockedRequest.mockResolvedValueOnce(user);
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('redirects guests to /login', async () => {
    renderAt('/');
    await waitFor(() => expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument());
  });

  it('renders the outlet for ADMIN', async () => {
    bootAs('ADMIN');
    renderAt('/');
    await waitFor(() => expect(screen.getByText('SHELL CONTENT')).toBeInTheDocument());
  });

  it('renders the outlet for INVENTORY_MANAGER', async () => {
    bootAs('INVENTORY_MANAGER');
    renderAt('/');
    await waitFor(() => expect(screen.getByText('SHELL CONTENT')).toBeInTheDocument());
  });

  it('shows access denied for CUSTOMER', async () => {
    bootAs('CUSTOMER');
    renderAt('/');
    await waitFor(() => expect(screen.getByText(/access denied/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/admin test -- ProtectedRoute`
Expected: FAIL — cannot resolve `./ProtectedRoute`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/admin/src/auth/ProtectedRoute.tsx`:

```typescript
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { isInternalRole } from './roles';
import { AccessDeniedPage } from '../pages/AccessDeniedPage';

export function ProtectedRoute() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center text-neutral-600"
      >
        Loading…
      </div>
    );
  }

  if (status === 'guest' || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!isInternalRole(user.role)) {
    return <AccessDeniedPage />;
  }

  return <Outlet />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/admin test -- ProtectedRoute`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/auth/ProtectedRoute.tsx apps/admin/src/auth/ProtectedRoute.test.tsx
git commit -m "feat(admin): add ProtectedRoute role gate (TDD)"
```

---

## Task 11: Admin — LoginPage (TDD)

**Files:**
- Create: `apps/admin/src/pages/LoginPage.tsx`
- Test: `apps/admin/src/pages/LoginPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/pages/LoginPage.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { ApiError } from '../lib/types';

const login = vi.fn();
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ login, status: 'guest', user: null, logout: vi.fn() }),
}));

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/', element: <div>HOME</div> },
    ],
    { initialEntries: ['/login'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('submits credentials and navigates home on success', async () => {
    login.mockResolvedValueOnce(undefined);
    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(login).toHaveBeenCalledWith('admin@example.com', 'Password123!');
    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument());
  });

  it('shows a generic error on 401 and surfaces it via role=alert', async () => {
    login.mockRejectedValueOnce(new ApiError(401, 'unauthorized'));
    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/invalid email or password/i);
  });

  it('shows a fallback error on non-401 failures', async () => {
    login.mockRejectedValueOnce(new ApiError(500, 'boom'));
    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/something went wrong/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/admin test -- LoginPage`
Expected: FAIL — cannot resolve `./LoginPage`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/admin/src/pages/LoginPage.tsx`:

```typescript
import { useRef, useState } from 'react';
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
      // move focus to the alert for screen-reader + keyboard users
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-neutral-200 bg-neutral-0 p-6"
      >
        <h1 className="font-heading text-2xl font-semibold text-neutral-900">Admin sign in</h1>

        {error && (
          <p
            role="alert"
            tabIndex={-1}
            ref={errorRef}
            className="rounded-md bg-error-500/10 px-3 py-2 text-sm text-error-600"
          >
            {error}
          </p>
        )}

        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            aria-invalid={!!error}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-neutral-200 px-3 py-2 text-neutral-900 focus-visible:outline-2 focus-visible:outline-primary-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            aria-invalid={!!error}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-neutral-200 px-3 py-2 text-neutral-900 focus-visible:outline-2 focus-visible:outline-primary-500"
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/admin test -- LoginPage`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/LoginPage.tsx apps/admin/src/pages/LoginPage.test.tsx
git commit -m "feat(admin): add accessible LoginPage (TDD)"
```

---

## Task 12: Admin — router + AppShell test + wire main.tsx

**Files:**
- Create: `apps/admin/src/router.tsx`
- Create: `apps/admin/src/components/AppShell.test.tsx`
- Modify: `apps/admin/src/main.tsx`
- Delete: `apps/admin/src/App.tsx`, `apps/admin/src/App.test.tsx`, `apps/admin/src/App.css`

- [ ] **Step 1: Write the AppShell test (failing)**

Create `apps/admin/src/components/AppShell.test.tsx`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from './AppShell';

const logout = vi.fn().mockResolvedValue(undefined);
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    logout,
    status: 'authed',
    user: { sub: '1', email: 'admin@example.com', role: 'ADMIN' },
    login: vi.fn(),
  }),
}));

function renderShell() {
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [{ path: '/', element: <div>DASH</div> }],
      },
      { path: '/login', element: <div>LOGIN PAGE</div> },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('AppShell', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the current user email', () => {
    renderShell();
    expect(screen.getByTestId('current-user')).toHaveTextContent('admin@example.com');
  });

  it('logs out and redirects to /login', async () => {
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(logout).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run it to confirm it passes against the existing AppShell**

Run: `npm --prefix apps/admin test -- AppShell`
Expected: PASS (2 tests). (AppShell already exists from Task 9; this locks its behavior.)

- [ ] **Step 3: Create `router.tsx`**

```typescript
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [{ index: true, element: <DashboardPage /> }],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
```

- [ ] **Step 4: Rewrite `main.tsx`**

Replace the contents of `apps/admin/src/main.tsx` with:

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import './index.css';
import { AuthProvider } from './auth/AuthContext';
import { router } from './router';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
```

- [ ] **Step 5: Delete scaffold placeholders**

Run:

```bash
git rm apps/admin/src/App.tsx apps/admin/src/App.test.tsx apps/admin/src/App.css
```

- [ ] **Step 6: Full verification gate**

Run each, expect all clean:

```bash
npm --prefix apps/admin test        # all suites green
npm --prefix apps/admin run lint     # clean
npm --prefix apps/admin run build    # tsc + vite build clean
```

Expected: tests pass (tokenStore, apiClient, roles, AuthContext, ProtectedRoute, LoginPage, AppShell), lint clean, build clean.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/router.tsx apps/admin/src/main.tsx apps/admin/src/components/AppShell.test.tsx
git commit -m "feat(admin): wire router + AuthProvider into app entry; drop scaffold"
```

---

## Task 13: Manual smoke test (RULE.md §5)

No code — prove the real thing boots and serves. Tests mock the API; this exercises it end-to-end against `ecom_dev`.

- [ ] **Step 1: Start the API**

Run (background): `npm --prefix apps/api run start:dev`
Expected: listens on `:5000`, Prisma connected.

- [ ] **Step 2: Start the admin app**

Run (background): `npm --prefix apps/admin run dev`
Expected: Vite serves on `:5002`.

- [ ] **Step 3: Walk the scenarios in a browser at http://localhost:5002**

Verify each:
1. Login as `admin@example.com` / `Password123!` → shell renders, header shows the email.
2. Hard refresh → still authed (boot `/auth/me` path).
3. Sign out → back at `/login`; visiting `/` redirects to `/login`.
4. Login as `inventory@example.com` / `Password123!` → shell renders (role allowed).
5. Register/seed a CUSTOMER (or use an existing one) and log in → Access Denied page.
6. Bad password → generic "Invalid email or password", focus on the alert.

- [ ] **Step 4: Record the result**

Note pass/fail for each scenario honestly. If any fails, fix before marking the task done.

---

## Task 14: Update PLAN.md + finish

**Files:**
- Modify: `PLAN.md`

- [ ] **Step 1: Mark the admin auth task done**

In `PLAN.md`:
- Phase 2 task: change `- [ ] Admin: login + role-gated app shell ...` to `- [x]`.
- Phase status table row 2: update to `✅ Done` (API ✅; storefront ✅; admin ✅).
- App status table: update `apps/admin` status note to mention auth shell.
- "Current focus" note: update to reflect admin auth complete + Phase 2 exit check.

- [ ] **Step 2: Commit**

```bash
git add PLAN.md
git commit -m "docs: mark Phase 2 admin auth shell done"
```

- [ ] **Step 3: STOP — phase/feature verification (RULE.md §1 + §6)**

This completes the last Phase 2 task. Stop and ask the user to verify. Since Phase 2 is now fully complete, also produce a copy-pasteable resume prompt (RULE.md §6) for the next session (Phase 3 — Product catalog), and ask whether to merge `feat/admin-auth-shell` to `main`.

---

## Self-Review notes
- **Spec coverage:** login (T11), localStorage tokenStore (T5), apiClient refresh-on-401 + concurrency guard (T6), AuthProvider/`/auth/me` authority (T8), React Router + ProtectedRoute (T10/T12), ADMIN+INVENTORY_MANAGER allow / CUSTOMER deny (T7/T10), shell + logout (T9/T12), a11y on login (T11), CORS (T1), seed users (T2), manual smoke (T13), PLAN.md (T14). All spec sections mapped.
- **Type consistency:** `Role`, `AuthUser`, `TokenPair`, `SessionExpiredError`, `ApiError` defined in T4 and used consistently; `apiClient.request`, `tokenStore.{get,set,clear}`, `isInternalRole`, `useAuth()` shape (`status|user|login|logout`) consistent across tasks.
- **No placeholders:** every code step shows complete code; every run step states the command + expected result.
```
