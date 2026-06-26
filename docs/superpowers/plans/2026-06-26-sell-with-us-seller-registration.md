# Sell With Us — Seller Registration UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a customer-facing "Sell with us" flow to the storefront — apply to become a seller (profile-only), then manage seller status and KYC on a dedicated screen.

**Architecture:** Mirror the existing storefront auth pattern: Server-Component page → `'use client'` form → route-handler proxy (`/api/seller/*`) → pure deps-injected handler → `lib` API client → NestJS API. The register proxy calls `POST /seller/register` then `POST /auth/refresh` and re-sets session cookies so the new SELLER role claim takes effect immediately (fixes the role-staleness 403). KYC lives on a separate screen via `PATCH /seller/me`.

**Tech Stack:** Next.js App Router, TypeScript (strict), Vitest + Testing Library, Tailwind (DESIGN.md tokens). Backend NestJS API already exists — no API changes.

## Global Constraints

- Surface is `apps/storefront` only. No API or admin-app changes.
- Strict TypeScript, no `any`. Types live in `lib/seller.ts`, mirror the API.
- Consume DESIGN.md tokens via Tailwind classes — never hardcode hex.
- Proxies are `server-only`; `API_URL` and tokens never reach the client.
- KYC client regex (mirror API `register-seller.dto.ts`, API stays source of truth):
  - GSTIN `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`
  - PAN `^[A-Z]{5}[0-9]{4}[A-Z]$`
  - Bank account `^[0-9]{9,18}$`
  - IFSC `^[A-Z]{4}0[A-Z0-9]{6}$`
- `next` redirect param must be a relative path: starts with `/`, not `//`.
- Run tests from `apps/storefront`: `npm test -- <pattern>` (Vitest). Lint `npm run lint`; types `npx tsc --noEmit`; build `npm run build`.
- All paths below are relative to `apps/storefront/`.

---

### Task 1: Seller types + client API functions (`lib/seller.ts`)

**Files:**
- Create: `src/lib/seller.ts`
- Test: `src/lib/seller.test.ts`

**Interfaces:**
- Consumes: `ApiAuthOptions`, `request`-style fetch from `@/lib/api-auth` (we re-implement thin calls here using the same `ApiAuthError` contract).
- Produces:
  - `type SellerStatus = 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'`
  - `interface SellerView { id: string; displayName: string; slug: string; description: string | null; logoUrl: string | null; status: SellerStatus; kycVerifiedAt: string | null; bankAccountLast4: string | null; gstinPresent: boolean; panPresent: boolean; bankIfscPresent: boolean; createdAt: string; updatedAt: string }`
  - `interface RegisterSellerInput { displayName: string; description?: string; logoUrl?: string }`
  - `interface UpdateSellerInput { displayName?: string; description?: string; logoUrl?: string; gstin?: string; pan?: string; bankAccountNo?: string; bankIfsc?: string }`
  - `registerSeller(input: RegisterSellerInput, opts: { baseUrl: string; accessToken: string; fetch?: typeof fetch }): Promise<SellerView>`
  - `getSellerMe(opts: { baseUrl: string; accessToken: string; fetch?: typeof fetch }): Promise<SellerView>`
  - `updateSellerMe(input: UpdateSellerInput, opts: { baseUrl: string; accessToken: string; fetch?: typeof fetch }): Promise<SellerView>`
  - `KYC_PATTERNS = { gstin: RegExp; pan: RegExp; bankAccountNo: RegExp; bankIfsc: RegExp }`
  - `validateKyc(input: UpdateSellerInput): Record<string, string>` — returns a map of field→error message for present-but-invalid fields; empty object when all good.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/seller.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
  KYC_PATTERNS,
  registerSeller,
  updateSellerMe,
  validateKyc,
} from './seller';

describe('KYC_PATTERNS', () => {
  it('accepts a valid PAN and rejects a bad one', () => {
    expect(KYC_PATTERNS.pan.test('ABCDE1234F')).toBe(true);
    expect(KYC_PATTERNS.pan.test('abcde1234f')).toBe(false);
  });
  it('accepts a valid IFSC and GSTIN', () => {
    expect(KYC_PATTERNS.bankIfsc.test('HDFC0001234')).toBe(true);
    expect(KYC_PATTERNS.gstin.test('22AAAAA0000A1Z5')).toBe(true);
  });
  it('accepts a 9-18 digit bank account, rejects too short', () => {
    expect(KYC_PATTERNS.bankAccountNo.test('123456789')).toBe(true);
    expect(KYC_PATTERNS.bankAccountNo.test('1234')).toBe(false);
  });
});

describe('validateKyc', () => {
  it('returns no errors when fields absent', () => {
    expect(validateKyc({})).toEqual({});
  });
  it('flags only present-but-invalid fields', () => {
    const errs = validateKyc({ pan: 'bad', bankIfsc: 'HDFC0001234' });
    expect(errs.pan).toBeDefined();
    expect(errs.bankIfsc).toBeUndefined();
  });
});

describe('registerSeller', () => {
  it('POSTs to /seller/register with bearer token and returns the view', async () => {
    const view = { id: 's1', displayName: 'Shop', status: 'PENDING_REVIEW' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => view,
    });
    const result = await registerSeller(
      { displayName: 'Shop' },
      { baseUrl: 'http://api', accessToken: 'tok', fetch: fetchMock as unknown as typeof fetch },
    );
    expect(result).toEqual(view);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api/seller/register');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });
});

describe('updateSellerMe', () => {
  it('PATCHes /seller/me', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 's1' }) });
    await updateSellerMe(
      { pan: 'ABCDE1234F' },
      { baseUrl: 'http://api', accessToken: 'tok', fetch: fetchMock as unknown as typeof fetch },
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api/seller/me');
    expect(init.method).toBe('PATCH');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/seller.test.ts`
Expected: FAIL — cannot resolve `./seller`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/seller.ts
import { ApiAuthError } from './api-auth';

export type SellerStatus =
  | 'PENDING_REVIEW'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'DEACTIVATED';

export interface SellerView {
  id: string;
  displayName: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  status: SellerStatus;
  kycVerifiedAt: string | null;
  bankAccountLast4: string | null;
  gstinPresent: boolean;
  panPresent: boolean;
  bankIfscPresent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterSellerInput {
  displayName: string;
  description?: string;
  logoUrl?: string;
}

export interface UpdateSellerInput {
  displayName?: string;
  description?: string;
  logoUrl?: string;
  gstin?: string;
  pan?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
}

export const KYC_PATTERNS = {
  gstin: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  bankAccountNo: /^[0-9]{9,18}$/,
  bankIfsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
} as const;

const KYC_MESSAGES: Record<keyof typeof KYC_PATTERNS, string> = {
  gstin: 'Enter a valid 15-character GSTIN.',
  pan: 'Enter a valid 10-character PAN.',
  bankAccountNo: 'Account number must be 9–18 digits.',
  bankIfsc: 'Enter a valid 11-character IFSC.',
};

/** Validate only the KYC fields that are present and non-empty. */
export function validateKyc(input: UpdateSellerInput): Record<string, string> {
  const errors: Record<string, string> = {};
  (Object.keys(KYC_PATTERNS) as (keyof typeof KYC_PATTERNS)[]).forEach((key) => {
    const value = input[key];
    if (typeof value === 'string' && value.length > 0 && !KYC_PATTERNS[key].test(value)) {
      errors[key] = KYC_MESSAGES[key];
    }
  });
  return errors;
}

interface SellerApiOptions {
  baseUrl: string;
  accessToken: string;
  fetch?: typeof fetch;
}

interface ApiErrorBody {
  message?: string | string[];
  error?: string;
}

function messageFrom(body: unknown, status: number): string {
  const b = body as ApiErrorBody | null;
  if (b && Array.isArray(b.message)) return b.message.join(', ');
  if (b && typeof b.message === 'string') return b.message;
  if (b && typeof b.error === 'string') return b.error;
  return `Request failed with status ${status}`;
}

async function sellerRequest<T>(
  path: string,
  init: RequestInit,
  opts: SellerApiOptions,
): Promise<T> {
  const fetchImpl = opts.fetch ?? fetch;
  const res = await fetchImpl(`${opts.baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${opts.accessToken}`,
      ...init.headers,
    },
  });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new ApiAuthError(messageFrom(body, res.status), res.status);
  return body as T;
}

export function registerSeller(
  input: RegisterSellerInput,
  opts: SellerApiOptions,
): Promise<SellerView> {
  return sellerRequest<SellerView>(
    '/seller/register',
    { method: 'POST', body: JSON.stringify(input) },
    opts,
  );
}

export function getSellerMe(opts: SellerApiOptions): Promise<SellerView> {
  return sellerRequest<SellerView>('/seller/me', { method: 'GET' }, opts);
}

export function updateSellerMe(
  input: UpdateSellerInput,
  opts: SellerApiOptions,
): Promise<SellerView> {
  return sellerRequest<SellerView>(
    '/seller/me',
    { method: 'PATCH', body: JSON.stringify(input) },
    opts,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/seller.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/seller.ts src/lib/seller.test.ts
git commit -m "feat(seller-ui): seller types, API client fns, KYC validators"
```

---

### Task 2: Add SELLER to the Role union

**Files:**
- Modify: `src/lib/api-auth.ts` (the `Role` type, ~line 9)

**Interfaces:**
- Produces: `type Role = 'CUSTOMER' | 'ADMIN' | 'INVENTORY_MANAGER' | 'SELLER'` — consumed by pages branching on `user.role`.

- [ ] **Step 1: Confirm no exhaustive switch breaks**

Run: `grep -rn "switch.*role\|case '" src/ | grep -i role`
Expected: no exhaustive `switch (role)` that would now miss a case. (If any appears, add a `'SELLER'` branch in that same commit.)

- [ ] **Step 2: Edit the union**

Change in `src/lib/api-auth.ts`:

```typescript
/** Customer roles, mirrors the Prisma `Role` enum used by the API. */
export type Role = 'CUSTOMER' | 'ADMIN' | 'INVENTORY_MANAGER' | 'SELLER';
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api-auth.ts
git commit -m "feat(seller-ui): add SELLER to storefront Role union"
```

---

### Task 3: Seller route-handler logic (`api/seller/handlers.ts`)

**Files:**
- Create: `src/app/api/seller/handlers.ts`
- Test: `src/app/api/seller/handlers.test.ts`

**Interfaces:**
- Consumes: `SellerView`, `RegisterSellerInput`, `UpdateSellerInput` from `@/lib/seller`; `TokenPair` from `@/lib/api-auth`.
- Produces:
  - `interface SellerHandlerResult { status: number; body: unknown }`
  - `interface SellerRouteDeps { register(input: RegisterSellerInput): Promise<SellerView>; getMe(): Promise<SellerView>; update(input: UpdateSellerInput): Promise<SellerView>; refreshSession(): Promise<void>; }`
  - `handleSellerRegister(input: Partial<RegisterSellerInput>, deps: SellerRouteDeps): Promise<SellerHandlerResult>`
  - `handleGetSellerMe(deps: SellerRouteDeps): Promise<SellerHandlerResult>`
  - `handleSellerUpdate(input: UpdateSellerInput, deps: SellerRouteDeps): Promise<SellerHandlerResult>`
- Note: `refreshSession()` performs the `/auth/refresh` + `setSession`; if it throws, register still returns `{ ok: true, reauth: true }`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/seller/handlers.test.ts
import { describe, expect, it, vi } from 'vitest';
import { ApiAuthError } from '@/lib/api-auth';
import {
  handleGetSellerMe,
  handleSellerRegister,
  handleSellerUpdate,
  type SellerRouteDeps,
} from './handlers';

const view = { id: 's1', displayName: 'Shop', status: 'PENDING_REVIEW' } as never;

function deps(over: Partial<SellerRouteDeps> = {}): SellerRouteDeps {
  return {
    register: vi.fn().mockResolvedValue(view),
    getMe: vi.fn().mockResolvedValue(view),
    update: vi.fn().mockResolvedValue(view),
    refreshSession: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('handleSellerRegister', () => {
  it('rejects a missing displayName with 400', async () => {
    const res = await handleSellerRegister({}, deps());
    expect(res.status).toBe(400);
  });

  it('registers then refreshes the session and returns ok', async () => {
    const order: string[] = [];
    const d = deps({
      register: vi.fn().mockImplementation(async () => { order.push('register'); return view; }),
      refreshSession: vi.fn().mockImplementation(async () => { order.push('refresh'); }),
    });
    const res = await handleSellerRegister({ displayName: 'Shop' }, d);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
    expect(order).toEqual(['register', 'refresh']);
  });

  it('maps a 409 conflict through', async () => {
    const d = deps({ register: vi.fn().mockRejectedValue(new ApiAuthError('You already have a seller account', 409)) });
    const res = await handleSellerRegister({ displayName: 'Shop' }, d);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: 'You already have a seller account' });
  });

  it('returns ok+reauth when refresh fails after a successful register', async () => {
    const d = deps({ refreshSession: vi.fn().mockRejectedValue(new Error('refresh down')) });
    const res = await handleSellerRegister({ displayName: 'Shop' }, d);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, reauth: true });
  });
});

describe('handleSellerUpdate', () => {
  it('omits empty fields before calling update', async () => {
    const update = vi.fn().mockResolvedValue(view);
    await handleSellerUpdate({ pan: 'ABCDE1234F', gstin: '' }, deps({ update }));
    expect(update).toHaveBeenCalledWith({ pan: 'ABCDE1234F' });
  });
});

describe('handleGetSellerMe', () => {
  it('returns the masked view', async () => {
    const res = await handleGetSellerMe(deps());
    expect(res.status).toBe(200);
    expect(res.body).toEqual(view);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/seller/handlers.test.ts`
Expected: FAIL — cannot resolve `./handlers`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/app/api/seller/handlers.ts
import { ApiAuthError } from '@/lib/api-auth';
import type {
  RegisterSellerInput,
  SellerView,
  UpdateSellerInput,
} from '@/lib/seller';

export interface SellerHandlerResult {
  status: number;
  body: unknown;
}

/** Injectable deps so handlers are unit-testable without Next/cookies. */
export interface SellerRouteDeps {
  register(input: RegisterSellerInput): Promise<SellerView>;
  getMe(): Promise<SellerView>;
  update(input: UpdateSellerInput): Promise<SellerView>;
  /** Mint a new token pair (carrying the fresh role) and persist it. */
  refreshSession(): Promise<void>;
}

function badRequest(message: string): SellerHandlerResult {
  return { status: 400, body: { message } };
}

function fromApiError(err: unknown): SellerHandlerResult {
  if (err instanceof ApiAuthError) {
    return { status: err.status, body: { message: err.message } };
  }
  throw err;
}

export async function handleSellerRegister(
  input: Partial<RegisterSellerInput>,
  deps: SellerRouteDeps,
): Promise<SellerHandlerResult> {
  const displayName = input.displayName?.trim() ?? '';
  if (!displayName) return badRequest('A shop display name is required.');

  const payload: RegisterSellerInput = { displayName };
  if (input.description?.trim()) payload.description = input.description.trim();
  if (input.logoUrl?.trim()) payload.logoUrl = input.logoUrl.trim();

  try {
    await deps.register(payload);
  } catch (err) {
    return fromApiError(err);
  }

  // Registration succeeded — the DB role is now SELLER but the caller's token
  // still says CUSTOMER. Refresh to pick up the new claim. A refresh failure
  // must NOT undo a successful registration.
  try {
    await deps.refreshSession();
  } catch {
    return { status: 201, body: { ok: true, reauth: true } };
  }
  return { status: 201, body: { ok: true } };
}

export async function handleGetSellerMe(
  deps: SellerRouteDeps,
): Promise<SellerHandlerResult> {
  try {
    const view = await deps.getMe();
    return { status: 200, body: view };
  } catch (err) {
    return fromApiError(err);
  }
}

const KYC_AND_PROFILE_FIELDS: (keyof UpdateSellerInput)[] = [
  'displayName',
  'description',
  'logoUrl',
  'gstin',
  'pan',
  'bankAccountNo',
  'bankIfsc',
];

export async function handleSellerUpdate(
  input: UpdateSellerInput,
  deps: SellerRouteDeps,
): Promise<SellerHandlerResult> {
  // Omit empty/absent fields so a blank submit never clears stored KYC.
  const payload: UpdateSellerInput = {};
  for (const key of KYC_AND_PROFILE_FIELDS) {
    const value = input[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      payload[key] = value.trim();
    }
  }
  try {
    const view = await deps.update(payload);
    return { status: 200, body: view };
  } catch (err) {
    return fromApiError(err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/seller/handlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/seller/handlers.ts src/app/api/seller/handlers.test.ts
git commit -m "feat(seller-ui): seller route-handler logic (register/me/update)"
```

---

### Task 4: Live route deps + route adapters (`api/seller/route-deps.ts`, `register/route.ts`, `me/route.ts`)

**Files:**
- Create: `src/app/api/seller/route-deps.ts`
- Create: `src/app/api/seller/register/route.ts`
- Create: `src/app/api/seller/me/route.ts`

**Interfaces:**
- Consumes: `SellerRouteDeps` (Task 3); `registerSeller`/`getSellerMe`/`updateSellerMe` (Task 1); `apiBaseUrl` (`@/lib/env`); `ACCESS_COOKIE`/`REFRESH_COOKIE`/`setSession`/`cookieOptions` (`@/lib/session`); `refresh` (`@/lib/api-auth`).
- Produces: `liveSellerRouteDeps(): Promise<SellerRouteDeps>`; `POST` (register), `GET`+`PATCH` (me) route exports.
- Note: no unit test for the live wiring (it binds to `cookies()`); it is covered by the live smoke in Task 10. The pure logic is already tested in Task 3.

- [ ] **Step 1: Create `route-deps.ts`**

```typescript
// src/app/api/seller/route-deps.ts
import 'server-only';
import { cookies } from 'next/headers';
import { refresh as apiRefresh } from '@/lib/api-auth';
import { apiBaseUrl } from '@/lib/env';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  cookieOptions,
} from '@/lib/session';
import {
  getSellerMe,
  registerSeller,
  updateSellerMe,
} from '@/lib/seller';
import type { SellerRouteDeps } from './handlers';

/** Production wiring: API client bound to the caller's access token + cookies. */
export async function liveSellerRouteDeps(): Promise<SellerRouteDeps> {
  const baseUrl = apiBaseUrl();
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value ?? '';
  const isProd = process.env.NODE_ENV === 'production';

  return {
    register: (input) => registerSeller(input, { baseUrl, accessToken }),
    getMe: () => getSellerMe({ baseUrl, accessToken }),
    update: (input) => updateSellerMe(input, { baseUrl, accessToken }),
    refreshSession: async () => {
      const refreshToken = store.get(REFRESH_COOKIE)?.value;
      if (!refreshToken) throw new Error('No refresh token');
      const pair = await apiRefresh(refreshToken, { baseUrl });
      // Route Handler context — cookie writes are allowed here.
      store.set(ACCESS_COOKIE, pair.accessToken, cookieOptions(isProd));
      store.set(REFRESH_COOKIE, pair.refreshToken, cookieOptions(isProd));
    },
  };
}
```

- [ ] **Step 2: Create `register/route.ts`**

```typescript
// src/app/api/seller/register/route.ts
import { NextResponse } from 'next/server';
import { handleSellerRegister } from '../handlers';
import { liveSellerRouteDeps } from '../route-deps';

export async function POST(req: Request) {
  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await handleSellerRegister(
    {
      displayName: input.displayName as string,
      description: input.description as string | undefined,
      logoUrl: input.logoUrl as string | undefined,
    },
    await liveSellerRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 3: Create `me/route.ts`**

```typescript
// src/app/api/seller/me/route.ts
import { NextResponse } from 'next/server';
import type { UpdateSellerInput } from '@/lib/seller';
import { handleGetSellerMe, handleSellerUpdate } from '../handlers';
import { liveSellerRouteDeps } from '../route-deps';

export async function GET() {
  const result = await handleGetSellerMe(await liveSellerRouteDeps());
  return NextResponse.json(result.body, { status: result.status });
}

export async function PATCH(req: Request) {
  const input = (await req.json().catch(() => ({}))) as UpdateSellerInput;
  const result = await handleSellerUpdate(input, await liveSellerRouteDeps());
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/seller/route-deps.ts src/app/api/seller/register/route.ts src/app/api/seller/me/route.ts
git commit -m "feat(seller-ui): live seller proxies (register + me GET/PATCH)"
```

---

### Task 5: Honor a validated `next` param in the login flow

**Files:**
- Modify: `src/components/auth/useAuthSubmit.ts`
- Modify: `src/components/auth/LoginForm.tsx`
- Modify: `src/app/(auth)/login/page.tsx`
- Test: `src/components/auth/LoginForm.test.tsx` (add cases — file exists)
- Create: `src/lib/safe-next.ts`
- Test: `src/lib/safe-next.test.ts`

**Interfaces:**
- Produces: `safeNext(raw: string | undefined): string` — returns `raw` if it is a relative in-app path (starts with single `/`), else `'/'`.
- `LoginForm` gains an optional prop `next?: string`, passed to `useAuthSubmit('/api/auth/login', next)`.

- [ ] **Step 1: Write the failing test for `safeNext`**

```typescript
// src/lib/safe-next.test.ts
import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('returns a relative path unchanged', () => {
    expect(safeNext('/sell')).toBe('/sell');
    expect(safeNext('/account/seller')).toBe('/account/seller');
  });
  it('falls back to / for missing or unsafe values', () => {
    expect(safeNext(undefined)).toBe('/');
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext('sell')).toBe('/');
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npm test -- src/lib/safe-next.test.ts`
Expected: FAIL — cannot resolve `./safe-next`.

- [ ] **Step 3: Implement `safe-next.ts`**

```typescript
// src/lib/safe-next.ts
/** Return an in-app relative path, or '/' if the input could be an open redirect. */
export function safeNext(raw: string | undefined): string {
  if (typeof raw !== 'string') return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  return raw;
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npm test -- src/lib/safe-next.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread `redirectTo` through `useAuthSubmit` (already supported)**

`useAuthSubmit(endpoint, redirectTo = '/')` already accepts `redirectTo`. No change needed to the hook — verify by reading it. Skip if confirmed.

- [ ] **Step 6: Add `next` prop to `LoginForm`**

Edit `src/components/auth/LoginForm.tsx`:

```typescript
export function LoginForm({ next = '/' }: { next?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { submit, error, pending } = useAuthSubmit('/api/auth/login', next);
  // ...rest unchanged
```

- [ ] **Step 7: Read `next` in the login page**

Edit `src/app/(auth)/login/page.tsx` — make it accept searchParams and pass a validated next:

```typescript
import Link from 'next/link';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';
import { safeNext } from '@/lib/safe-next';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNext(next);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-content">Sign in</h1>
        <p className="text-sm text-content-muted">
          Welcome back. Enter your details to continue.
        </p>
      </header>
      <LoginForm next={target} />
      <p className="text-sm text-content-muted">
        <Link href="/forgot-password" className="font-medium text-primary-600 hover:text-primary-700">
          Forgot password?
        </Link>
      </p>
      <p className="text-sm text-content-muted">
        New here?{' '}
        <Link href="/register" className="font-medium text-primary-600 hover:text-primary-700">
          Create an account
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 8: Add a LoginForm test case**

Append to `src/components/auth/LoginForm.test.tsx` a test that, given `next="/sell"`, a successful submit calls `router.push('/sell')`. (Match the existing mock style in that file — it already mocks `next/navigation` and `fetch`. If the file mocks `useAuthSubmit` directly instead, assert `useAuthSubmit` is called with `('/api/auth/login', '/sell')`.)

```typescript
it('redirects to a provided next path on success', async () => {
  // Arrange: mirror the existing success-path setup in this file, render <LoginForm next="/sell" />,
  // submit valid credentials, then assert the router push target is '/sell'.
});
```

Fill the test body to match the file's existing harness (read the top of the file first).

- [ ] **Step 9: Run the auth tests**

Run: `npm test -- src/components/auth/LoginForm.test.tsx src/lib/safe-next.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/safe-next.ts src/lib/safe-next.test.ts src/components/auth/LoginForm.tsx "src/app/(auth)/login/page.tsx" src/components/auth/LoginForm.test.tsx
git commit -m "feat(seller-ui): honor validated next param in login flow"
```

---

### Task 6: SellerRegisterForm component

**Files:**
- Create: `src/components/seller/SellerRegisterForm.tsx`
- Test: `src/components/seller/SellerRegisterForm.test.tsx`

**Interfaces:**
- Consumes: `TextField`, `FormError`, `SubmitButton` from `@/components/auth/fields`; `useAuthSubmit` from `@/components/auth/useAuthSubmit`.
- Produces: `<SellerRegisterForm />` — POSTs to `/api/seller/register`, on success redirects to `/account/seller`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/seller/SellerRegisterForm.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

import { SellerRegisterForm } from './SellerRegisterForm';

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  vi.restoreAllMocks();
});

describe('SellerRegisterForm', () => {
  it('blocks submit when display name is empty', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    render(<SellerRegisterForm />);
    fireEvent.submit(screen.getByRole('button', { name: /submit application/i }).closest('form')!);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('submits and redirects to /account/seller on success', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);
    render(<SellerRegisterForm />);
    fireEvent.change(screen.getByLabelText(/shop display name/i), { target: { value: 'My Shop' } });
    fireEvent.submit(screen.getByRole('button', { name: /submit application/i }).closest('form')!);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/account/seller'));
  });

  it('surfaces a server error message', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'You already have a seller account' }),
    } as Response);
    render(<SellerRegisterForm />);
    fireEvent.change(screen.getByLabelText(/shop display name/i), { target: { value: 'My Shop' } });
    fireEvent.submit(screen.getByRole('button', { name: /submit application/i }).closest('form')!);
    await waitFor(() =>
      expect(screen.getByText(/already have a seller account/i)).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npm test -- src/components/seller/SellerRegisterForm.test.tsx`
Expected: FAIL — cannot resolve `./SellerRegisterForm`.

- [ ] **Step 3: Implement the component**

```tsx
// src/components/seller/SellerRegisterForm.tsx
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
```

- [ ] **Step 4: Run it (passes)**

Run: `npm test -- src/components/seller/SellerRegisterForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/seller/SellerRegisterForm.tsx src/components/seller/SellerRegisterForm.test.tsx
git commit -m "feat(seller-ui): SellerRegisterForm (profile-only)"
```

---

### Task 7: SellerStatusCard + SellerKycForm components

**Files:**
- Create: `src/components/seller/SellerStatusCard.tsx`
- Test: `src/components/seller/SellerStatusCard.test.tsx`
- Create: `src/components/seller/SellerKycForm.tsx`
- Test: `src/components/seller/SellerKycForm.test.tsx`

**Interfaces:**
- Consumes: `SellerView`, `SellerStatus`, `validateKyc`, `UpdateSellerInput` from `@/lib/seller`; `TextField`/`FormError`/`SubmitButton` from `@/components/auth/fields`; `useAuthSubmit`.
- Produces: `<SellerStatusCard seller={SellerView} />`; `<SellerKycForm seller={SellerView} />` (PATCHes `/api/seller/me`, on success `router.refresh()`).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/seller/SellerStatusCard.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SellerStatusCard } from './SellerStatusCard';

const base = {
  id: 's1', displayName: 'My Shop', slug: 'my-shop', description: null, logoUrl: null,
  kycVerifiedAt: null, bankAccountLast4: null, gstinPresent: false, panPresent: false,
  bankIfscPresent: false, createdAt: '', updatedAt: '',
};

describe('SellerStatusCard', () => {
  it('shows the status label', () => {
    render(<SellerStatusCard seller={{ ...base, status: 'PENDING_REVIEW' }} />);
    expect(screen.getByText(/pending review/i)).toBeInTheDocument();
  });
  it('summarizes KYC presence', () => {
    render(<SellerStatusCard seller={{ ...base, status: 'ACTIVE', panPresent: true, bankAccountLast4: '6789' }} />);
    expect(screen.getByText(/PAN on file/i)).toBeInTheDocument();
    expect(screen.getByText(/6789/)).toBeInTheDocument();
  });
});
```

```tsx
// src/components/seller/SellerKycForm.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

import { SellerKycForm } from './SellerKycForm';

const seller = {
  id: 's1', displayName: 'My Shop', slug: 'my-shop', description: null, logoUrl: null,
  status: 'PENDING_REVIEW' as const, kycVerifiedAt: null, bankAccountLast4: null,
  gstinPresent: false, panPresent: false, bankIfscPresent: false, createdAt: '', updatedAt: '',
};

beforeEach(() => { refresh.mockClear(); vi.restoreAllMocks(); });

describe('SellerKycForm', () => {
  it('blocks an invalid PAN client-side', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    render(<SellerKycForm seller={seller} />);
    fireEvent.change(screen.getByLabelText(/PAN/i), { target: { value: 'bad' } });
    fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('PATCHes only non-empty fields and refreshes on success', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({}),
    } as Response);
    render(<SellerKycForm seller={seller} />);
    fireEvent.change(screen.getByLabelText(/PAN/i), { target: { value: 'ABCDE1234F' } });
    fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ pan: 'ABCDE1234F' });
  });
});
```

- [ ] **Step 2: Run them (fail)**

Run: `npm test -- src/components/seller/SellerStatusCard.test.tsx src/components/seller/SellerKycForm.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `SellerStatusCard.tsx`**

```tsx
// src/components/seller/SellerStatusCard.tsx
import type { SellerStatus, SellerView } from '@/lib/seller';

const STATUS_LABEL: Record<SellerStatus, string> = {
  PENDING_REVIEW: 'Pending review',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  DEACTIVATED: 'Deactivated',
};

const STATUS_CLASS: Record<SellerStatus, string> = {
  PENDING_REVIEW: 'bg-warning-500/10 text-warning-600',
  ACTIVE: 'bg-success-500/10 text-success-600',
  SUSPENDED: 'bg-error-500/10 text-error-600',
  DEACTIVATED: 'bg-surface-muted text-content-subtle',
};

function kycLine(label: string, present: boolean, detail?: string | null): string {
  if (!present) return `${label} not added`;
  return detail ? `${label} on file ••••${detail}` : `${label} on file`;
}

export function SellerStatusCard({ seller }: { seller: SellerView }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-content-subtle">
            Shop
          </span>
          <span className="text-lg font-semibold text-content">{seller.displayName}</span>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[seller.status]}`}>
          {STATUS_LABEL[seller.status]}
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-2 text-sm text-content-muted sm:grid-cols-2">
        <dd>{kycLine('PAN', seller.panPresent)}</dd>
        <dd>{kycLine('GSTIN', seller.gstinPresent)}</dd>
        <dd>{kycLine('Bank account', Boolean(seller.bankAccountLast4), seller.bankAccountLast4)}</dd>
        <dd>{kycLine('IFSC', seller.bankIfscPresent)}</dd>
      </dl>
      {seller.status === 'PENDING_REVIEW' ? (
        <p className="text-sm text-content-subtle">
          Your application is under review. You can add or update your tax and bank
          details below while you wait.
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Implement `SellerKycForm.tsx`**

```tsx
// src/components/seller/SellerKycForm.tsx
'use client';

import { useState } from 'react';
import { FormError, SubmitButton, TextField } from '@/components/auth/fields';
import { useAuthSubmit } from '@/components/auth/useAuthSubmit';
import { validateKyc, type SellerView, type UpdateSellerInput } from '@/lib/seller';

export function SellerKycForm({ seller }: { seller: SellerView }) {
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  // Refresh the page on success so SellerStatusCard reflects the new presence flags.
  const { submit, error, pending, setError } = useAuthSubmit('/api/seller/me', '');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input: UpdateSellerInput = { gstin, pan, bankAccountNo, bankIfsc };
    const errors = validateKyc(input);
    const firstError = Object.values(errors)[0];
    if (firstError) {
      setError(firstError);
      return;
    }
    // Only send non-empty fields (never wipe stored KYC with a blank submit).
    const payload: Record<string, string> = {};
    if (gstin.trim()) payload.gstin = gstin.trim();
    if (pan.trim()) payload.pan = pan.trim();
    if (bankAccountNo.trim()) payload.bankAccountNo = bankAccountNo.trim();
    if (bankIfsc.trim()) payload.bankIfsc = bankIfsc.trim();
    if (Object.keys(payload).length === 0) {
      setError('Enter at least one detail to save.');
      return;
    }
    await submit(payload);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={error} />
      <p className="text-sm text-content-muted">
        Tax and bank details are encrypted and used for verification only. Leave a field
        blank to keep its stored value unchanged.
        {seller.panPresent ? ' Your PAN is already on file.' : ''}
      </p>
      <TextField label="PAN" name="pan" value={pan} onChange={setPan} hint="e.g. ABCDE1234F" />
      <TextField label="GSTIN" name="gstin" value={gstin} onChange={setGstin} hint="15 characters" />
      <TextField
        label="Bank account number"
        name="bankAccountNo"
        value={bankAccountNo}
        onChange={setBankAccountNo}
        hint="9–18 digits"
      />
      <TextField label="IFSC" name="bankIfsc" value={bankIfsc} onChange={setBankIfsc} hint="e.g. HDFC0001234" />
      <SubmitButton pending={pending}>Save details</SubmitButton>
    </form>
  );
}
```

Note: `useAuthSubmit` with `redirectTo = ''` calls `router.push('')` then `router.refresh()`. `router.push('')` is a no-op navigation to the current URL; the `refresh()` re-renders the server component. This matches the test asserting `refresh` is called. (If the existing hook treats `''` oddly during execution, switch to `router.refresh()`-only by passing the current pathname — adjust at execution time; the test asserts `refresh()`, which holds either way.)

- [ ] **Step 5: Run the tests (pass)**

Run: `npm test -- src/components/seller/SellerStatusCard.test.tsx src/components/seller/SellerKycForm.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/seller/SellerStatusCard.tsx src/components/seller/SellerStatusCard.test.tsx src/components/seller/SellerKycForm.tsx src/components/seller/SellerKycForm.test.tsx
git commit -m "feat(seller-ui): SellerStatusCard + SellerKycForm"
```

---

### Task 8: `/sell` and `/account/seller` pages (role-gated)

**Files:**
- Create: `src/app/sell/page.tsx`
- Create: `src/app/account/seller/page.tsx`
- Test: `src/lib/route-protection.test.ts` (add a regression-guard case — no source change; `/account` prefix already covers `/account/seller`)

**Interfaces:**
- Consumes: `getCurrentUser` from `@/lib/session`; `getSellerMe` from `@/lib/seller`; `apiBaseUrl` (`@/lib/env`); `ACCESS_COOKIE` (`@/lib/session`); `SellerRegisterForm`, `SellerStatusCard`, `SellerKycForm`.
- Produces: two route pages.

- [ ] **Step 1: Add a regression guard test for `/account/seller`**

`/account/seller` is already covered by the existing `/account` prefix
(`isProtected` does `startsWith('/account/')`), so **no code change to
`route-protection.ts` is needed** — this step adds a regression guard so a
future refactor of the prefixes can't silently un-protect the seller screen.

Append to `src/lib/route-protection.test.ts`:

```typescript
it('treats /account/seller as protected', () => {
  expect(isProtected('/account/seller')).toBe(true);
});
```

Run: `npm test -- src/lib/route-protection.test.ts`
Expected: PASS immediately (guard confirms existing behavior; no source edit).

- [ ] **Step 3: Create `/sell` page**

```tsx
// src/app/sell/page.tsx
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/session';
import { SellerRegisterForm } from '@/components/seller/SellerRegisterForm';

export const metadata: Metadata = { title: 'Sell with us' };

export default async function SellPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/sell');
  if (user.role === 'SELLER') redirect('/account/seller');

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-content">Sell with us</h1>
        <p className="text-sm text-content-muted">
          Apply to open a shop. We&apos;ll review your application and let you know
          when you can start listing products. You can add tax and bank details after
          you apply.
        </p>
      </header>
      <SellerRegisterForm />
    </main>
  );
}
```

- [ ] **Step 4: Create `/account/seller` page**

```tsx
// src/app/account/seller/page.tsx
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/session';
import { apiBaseUrl } from '@/lib/env';
import { ACCESS_COOKIE } from '@/lib/session';
import { getSellerMe } from '@/lib/seller';
import { SellerStatusCard } from '@/components/seller/SellerStatusCard';
import { SellerKycForm } from '@/components/seller/SellerKycForm';

export const metadata: Metadata = { title: 'My shop' };

export default async function SellerAccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/account/seller');
  if (user.role !== 'SELLER') redirect('/sell');

  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value ?? '';
  const seller = await getSellerMe({ baseUrl: apiBaseUrl(), accessToken });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-content">My shop</h1>
        <p className="text-sm text-content-muted">
          Your seller status and verification details.
        </p>
      </header>
      <SellerStatusCard seller={seller} />
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-content">Tax &amp; bank details</h2>
        <SellerKycForm seller={seller} />
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/sell/page.tsx src/app/account/seller/page.tsx src/lib/route-protection.test.ts
git commit -m "feat(seller-ui): /sell and /account/seller pages (role-gated) + route-protection guard"
```

---

### Task 9: Entry points (header, footer, account CTA)

**Files:**
- Modify: `src/components/layout/SiteHeaderView.tsx` (add to `NAV_LINKS`)
- Modify: `src/components/layout/SiteFooter.tsx`
- Modify: `src/app/account/page.tsx`
- Test: `src/components/layout/SiteHeaderView.test.tsx` (if it exists — add a case; else skip)

**Interfaces:**
- Consumes: existing `NAV_LINKS`, `CurrentUser`.
- Produces: visible "Sell with us" links + an account CTA.

- [ ] **Step 1: Add header nav link**

In `src/components/layout/SiteHeaderView.tsx`:

```typescript
export const NAV_LINKS = [
  { href: '/products', label: 'Products' },
  { href: '/categories', label: 'Categories' },
  { href: '/sell', label: 'Sell with us' },
] as const;
```

- [ ] **Step 2: Add footer link**

In `src/components/layout/SiteFooter.tsx`, add a link to `/sell` labelled "Sell with us" in the existing link list (match the surrounding markup/classes).

- [ ] **Step 3: Add account CTA**

In `src/app/account/page.tsx`, after the email `<dl>`, branch on role:

```tsx
import Link from 'next/link';
// ...
{user.role === 'SELLER' ? (
  <Link
    href="/account/seller"
    className="inline-flex w-fit rounded-md bg-primary-500 px-4 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
  >
    Manage your shop
  </Link>
) : (
  <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-6">
    <h2 className="text-lg font-semibold text-content">Start selling</h2>
    <p className="text-sm text-content-muted">
      Open a shop and reach customers across the marketplace.
    </p>
    <Link
      href="/sell"
      className="mt-2 inline-flex w-fit rounded-md bg-primary-500 px-4 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
    >
      Become a seller
    </Link>
  </div>
)}
```

(`getCurrentUser()` already runs at the top of the page and `user.role` is now typed to include `'SELLER'`.)

- [ ] **Step 4: Run the layout/account tests**

Run: `npm test -- src/components/layout src/app/account`
Expected: PASS (update any snapshot/nav-count assertion that now expects the extra link).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/SiteHeaderView.tsx src/components/layout/SiteFooter.tsx src/app/account/page.tsx
git commit -m "feat(seller-ui): Sell-with-us entry points (header, footer, account)"
```

---

### Task 10: Full verification + live smoke

**Files:** none (verification only).

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: clean (fix any new issues).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: all green (including pre-existing tests).

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: build succeeds; `/sell` and `/account/seller` appear in the route list.

- [ ] **Step 5: Live smoke vs `ecom_dev`**

Start the API fresh (`cd ../../apps/api && npm run start:dev`) — confirm "Mapped {/seller/register, POST}" in the logs (guard against a stale :5000). Start the storefront (`npm run dev`). Then in a browser:
1. Register a brand-new customer, go to `/sell`, submit a display name.
2. Confirm you land on `/account/seller` showing **Pending review WITHOUT a re-login** (proves the proxy auto-refresh).
3. Enter a valid PAN in the KYC form, save; confirm the card now shows "PAN on file".
4. In the admin app, approve the seller; reload `/account/seller`; confirm **Active**.
5. As a guest (logged out), visit `/sell`; confirm redirect to `/login?next=/sell`, and after login you return to `/sell`.

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore(seller-ui): verification fixes"
```

---

## Notes for the implementer

- Read the top of each existing test file before adding cases — match its mock style (`vi.mock('next/navigation', ...)`, fetch spying) exactly.
- The API must be reachable at `API_URL` (default `http://localhost:5000`). KYC values are encrypted server-side; the masked `GET /seller/me` never returns them — assert on presence flags / last-4 only.
- Do not push or open a PR — the user merges manually (push-only-then-resume workflow). Stop after Task 10 for verification.
