# M4b S4a — Storefront Notification Feed + Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a storefront header notification bell + coral unread badge + dropdown panel (first page, mark-one/mark-all), consuming the merged S1 notifications API through a same-origin proxy — on branch `feat/notifications-ui`.

**Architecture:** Mirror the reviews/orders storefront authed-data pattern: a server-only client (`lib/notifications.ts`) over `authedRequest`; four same-origin route handlers (`app/api/notifications/*`) with an injectable `RouteDeps` (`handlers.ts` + `route-deps.ts`); a `'use client'` `NotificationBell` island that talks to those routes via `fetch`, owns the dropdown + fetched state + mark actions, and is rendered in `SiteHeaderView`'s right zone only for a signed-in user. A pure `notification-messages.ts` maps `NotificationType` → friendly copy + relative time.

**Tech Stack:** Next.js (App Router) + TypeScript (strict), Vitest + RTL + happy-dom, Tailwind v4 tokens (Quiet-Luxury). Consumption-only — no API/backend/DB change.

## Global Constraints

- **Branch:** `feat/notifications-ui` (off `main` w/ all notifications backend; spec committed at `6790afb`). Merge into `main` locally when done (user's workflow) — STOP for the light/dark browser smoke first (RULE.md §1, §10).
- **Consumption-only:** no changes under `apps/api`. Consume the S1 endpoints as-is.
- **`server-only` isolation (the `next build` gate):** `lib/notifications.ts` + `route-deps.ts` import `'server-only'` and `authedRequest`. The `NotificationBell` client island must import ONLY the same-origin `fetch` layer (`lib/notifications-client.ts` — a tiny browser-safe fetch wrapper) + the pure `notification-messages.ts` — NEVER `lib/notifications.ts`/`api-authed`. A leak fails `next build` (per the storefront-server-only-client-leak memory).
- **S1 API shapes:** `GET /notifications?page&pageSize&unread` → `{ data: NotificationView[], page, pageSize, total, totalPages }`; `NotificationView = { id: string; type: NotificationType; payload: unknown; readAt: string | null; createdAt: string }`. `GET /notifications/unread-count` → `{ count: number }`. `PATCH /notifications/:id/read` → 204. `PATCH /notifications/read-all` → `{ updated: number }`. (`NotificationType` is the API enum; the client re-declares the string-union it needs — do NOT import `@prisma/client` into the storefront.)
- **Badge:** coral brand + literal light text, hidden at 0, "9+" over 9, `aria-label`. Mirror `CartCountBadge` (`bg-primary-500 text-surface`); if it washes out in dark, use `bg-primary-600 text-white` (theme-safe-buttons rule). Verify BOTH themes.
- **Fetch on mount + after actions; no polling.** Bell fetches unread-count on mount; fetches the list on open; re-fetches count after mark-one/mark-all.
- Strict TS, no `any`. Run from `apps/storefront` with absolute paths (cwd resets). Test: `npx vitest run <file>`. Build: `npm run build`.

---

## File structure

```
apps/storefront/src/
  lib/notifications.ts                    CREATE  server-only: listNotifications/getUnreadCount/markRead/markAllRead over authedRequest + types
  lib/notifications.test.ts               CREATE
  lib/notifications-client.ts             CREATE  browser-safe same-origin fetch wrapper (no server-only) the bell uses
  lib/notifications-client.test.ts        CREATE
  lib/notification-messages.ts            CREATE  pure NotificationType→text mapper + relativeTime(iso, now)
  lib/notification-messages.test.ts       CREATE
  app/api/notifications/route.ts                    CREATE  GET → list (query passthrough)
  app/api/notifications/handlers.ts                 CREATE  handler fns + NotificationsRouteDeps
  app/api/notifications/route-deps.ts               CREATE  live deps (server-only, authedRequest)
  app/api/notifications/handlers.test.ts            CREATE
  app/api/notifications/unread-count/route.ts       CREATE  GET → unread-count
  app/api/notifications/read-all/route.ts           CREATE  PATCH → mark-all
  app/api/notifications/[id]/read/route.ts          CREATE  PATCH → mark-one
  components/notifications/NotificationBell.tsx      CREATE  'use client' island (bell + badge + dropdown)
  components/notifications/NotificationBell.test.tsx CREATE
  components/layout/SiteHeaderView.tsx               MODIFY  render {user && <NotificationBell/>} in the right zone
```

**Task order:**
1. Pure message mapper (`notification-messages.ts`) — no deps, unblocks the bell's rendering.
2. Server-only client (`lib/notifications.ts`) + the four route handlers (proxy).
3. Browser fetch wrapper (`notifications-client.ts`) + `NotificationBell` island + tests.
4. Wire the bell into `SiteHeaderView` + build.
5. Light/dark browser smoke + final gate → STOP for verification.

---

### Task 1: Pure message mapper + relative time

**Files:**
- Create: `apps/storefront/src/lib/notification-messages.ts`
- Test: `apps/storefront/src/lib/notification-messages.test.ts`

**Interfaces:**
- Produces:
  - `type NotificationTypeStr = 'REGISTRATION_CONFIRMATION' | 'ORDER_CONFIRMATION' | 'SHIPPING_UPDATE' | 'DELIVERY_UPDATE' | 'NEW_ORDER' | 'LOW_STOCK' | 'REFUND_REQUEST' | 'NEW_REVIEW' | 'SELLER_REGISTERED' | 'SELLER_KYC_APPROVED' | 'SELLER_KYC_REJECTED'` (the API enum mirrored as a string union — the storefront must not import `@prisma/client`).
  - `notificationText(type: string, payload: unknown): string`
  - `relativeTime(iso: string, now?: Date): string`

- [ ] **Step 1: Write the failing test** `notification-messages.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { notificationText, relativeTime } from './notification-messages';

describe('notificationText', () => {
  it('maps customer types to friendly copy', () => {
    expect(notificationText('ORDER_CONFIRMATION', {})).toBe('Your order was placed');
    expect(notificationText('SHIPPING_UPDATE', {})).toBe('Your order has shipped');
    expect(notificationText('DELIVERY_UPDATE', {})).toBe('Your order was delivered');
    expect(notificationText('REGISTRATION_CONFIRMATION', {})).toBe('Welcome to the shop');
  });
  it('falls back for unmapped/staff/unknown types', () => {
    expect(notificationText('NEW_ORDER', {})).toBe('You have a new notification');
    expect(notificationText('SOMETHING_FUTURE', {})).toBe('You have a new notification');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-07-07T12:00:00.000Z');
  it('buckets recent/hours/days', () => {
    expect(relativeTime('2026-07-07T11:59:30.000Z', now)).toBe('just now');
    expect(relativeTime('2026-07-07T10:00:00.000Z', now)).toBe('2h ago');
    expect(relativeTime('2026-07-04T12:00:00.000Z', now)).toBe('3d ago');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/storefront && npx vitest run src/lib/notification-messages.test.ts`
Expected: FAIL — cannot resolve `./notification-messages`.

- [ ] **Step 3: Implement `notification-messages.ts`:**

```ts
/** API NotificationType mirrored as a string union (storefront must not import @prisma/client). */
export type NotificationTypeStr =
  | 'REGISTRATION_CONFIRMATION' | 'ORDER_CONFIRMATION' | 'SHIPPING_UPDATE'
  | 'DELIVERY_UPDATE' | 'NEW_ORDER' | 'LOW_STOCK' | 'REFUND_REQUEST'
  | 'NEW_REVIEW' | 'SELLER_REGISTERED' | 'SELLER_KYC_APPROVED' | 'SELLER_KYC_REJECTED';

const MESSAGES: Partial<Record<NotificationTypeStr, string>> = {
  ORDER_CONFIRMATION: 'Your order was placed',
  SHIPPING_UPDATE: 'Your order has shipped',
  DELIVERY_UPDATE: 'Your order was delivered',
  REGISTRATION_CONFIRMATION: 'Welcome to the shop',
};

/** Friendly copy for a notification. Unknown/staff types → a safe generic. */
export function notificationText(type: string, _payload: unknown): string {
  return MESSAGES[type as NotificationTypeStr] ?? 'You have a new notification';
}

/** Compact relative time. `now` injectable for deterministic tests. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/storefront && npx vitest run src/lib/notification-messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/storefront/src/lib/notification-messages.ts apps/storefront/src/lib/notification-messages.test.ts
git commit -m "feat(storefront-notifications): per-type message mapper + relative time"
```

---

### Task 2: Server-only client + proxy route handlers

**Files:**
- Create: `apps/storefront/src/lib/notifications.ts`, `apps/storefront/src/lib/notifications.test.ts`
- Create: `apps/storefront/src/app/api/notifications/handlers.ts`, `.../route-deps.ts`, `.../handlers.test.ts`
- Create: `apps/storefront/src/app/api/notifications/route.ts`, `.../unread-count/route.ts`, `.../read-all/route.ts`, `.../[id]/read/route.ts`

**Interfaces:**
- Consumes: `authedRequest`, `liveAuthedDeps`, `AuthedApiDeps`, `ApiAuthError` from `@/lib/api-authed` + `@/lib/api-auth` (as `api-reviews.ts` / `api-orders.ts` do).
- Produces:
  - `lib/notifications.ts`: `NotificationView` type; `listNotifications(query, deps): Promise<NotificationPage>`, `getUnreadCount(deps): Promise<{count:number}>`, `markRead(id, deps): Promise<void>`, `markAllRead(deps): Promise<{updated:number}>`.
  - `handlers.ts`: `NotificationsRouteDeps` + `handleList`/`handleUnreadCount`/`handleMarkRead`/`handleMarkAll` returning `{ status, body }`.
  - `route-deps.ts`: `liveNotificationsRouteDeps(): NotificationsRouteDeps`.

- [ ] **Step 1: Create `lib/notifications.ts`** (mirror `api-reviews.ts` — `import 'server-only'` + `authedRequest`):

```ts
import 'server-only';
import { authedRequest, type AuthedApiDeps } from './api-authed';

export type { AuthedApiDeps } from './api-authed';

export interface NotificationView {
  id: string;
  type: string;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
}
export interface NotificationPage {
  data: NotificationView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export interface ListNotificationsQuery {
  page?: number;
  pageSize?: number;
  unread?: boolean;
}

function toQuery(q: ListNotificationsQuery): string {
  const p = new URLSearchParams();
  if (q.page !== undefined) p.set('page', String(q.page));
  if (q.pageSize !== undefined) p.set('pageSize', String(q.pageSize));
  if (q.unread !== undefined) p.set('unread', String(q.unread));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function listNotifications(query: ListNotificationsQuery, deps: AuthedApiDeps): Promise<NotificationPage> {
  return authedRequest<NotificationPage>(`/notifications${toQuery(query)}`, { method: 'GET' }, deps);
}
export function getUnreadCount(deps: AuthedApiDeps): Promise<{ count: number }> {
  return authedRequest<{ count: number }>(`/notifications/unread-count`, { method: 'GET' }, deps);
}
export function markRead(id: string, deps: AuthedApiDeps): Promise<void> {
  return authedRequest<void>(`/notifications/${id}/read`, { method: 'PATCH' }, deps);
}
export function markAllRead(deps: AuthedApiDeps): Promise<{ updated: number }> {
  return authedRequest<{ updated: number }>(`/notifications/read-all`, { method: 'PATCH' }, deps);
}
```

- [ ] **Step 2: Write `lib/notifications.test.ts`** (mirror `api-reviews.test.ts` — mock `authedRequest`; assert path/verb/query):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('./api-authed', () => ({ authedRequest: vi.fn() }));
import { authedRequest } from './api-authed';
import { listNotifications, getUnreadCount, markRead, markAllRead } from './notifications';

const req = authedRequest as unknown as ReturnType<typeof vi.fn>;
const deps = {} as never;

describe('notifications client', () => {
  beforeEach(() => req.mockReset());
  it('listNotifications builds query + GET', async () => {
    req.mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0, totalPages: 1 });
    await listNotifications({ page: 1, pageSize: 10 }, deps);
    expect(req).toHaveBeenCalledWith('/notifications?page=1&pageSize=10', { method: 'GET' }, deps);
  });
  it('getUnreadCount GETs the count route', async () => {
    req.mockResolvedValue({ count: 3 });
    await getUnreadCount(deps);
    expect(req).toHaveBeenCalledWith('/notifications/unread-count', { method: 'GET' }, deps);
  });
  it('markRead PATCHes the id route', async () => {
    req.mockResolvedValue(undefined);
    await markRead('n1', deps);
    expect(req).toHaveBeenCalledWith('/notifications/n1/read', { method: 'PATCH' }, deps);
  });
  it('markAllRead PATCHes read-all', async () => {
    req.mockResolvedValue({ updated: 2 });
    await markAllRead(deps);
    expect(req).toHaveBeenCalledWith('/notifications/read-all', { method: 'PATCH' }, deps);
  });
});
```

- [ ] **Step 3: Run to verify Steps 1–2** — `npx vitest run src/lib/notifications.test.ts` → PASS.

- [ ] **Step 4: Create `app/api/notifications/handlers.ts`** (mirror `orders/handlers.ts`'s injectable-deps + `fromApiError` shape):

```ts
import { ApiAuthError } from '@/lib/api-auth';
import type { NotificationPage, ListNotificationsQuery } from '@/lib/notifications';

export interface NotificationHandlerResult {
  status: number;
  body: unknown;
}

export interface NotificationsRouteDeps {
  list(query: ListNotificationsQuery): Promise<NotificationPage>;
  unreadCount(): Promise<{ count: number }>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<{ updated: number }>;
}

function fromApiError(err: unknown): NotificationHandlerResult {
  if (err instanceof ApiAuthError) return { status: err.status, body: { message: err.message } };
  throw err;
}

export async function handleList(query: ListNotificationsQuery, deps: NotificationsRouteDeps): Promise<NotificationHandlerResult> {
  try { return { status: 200, body: await deps.list(query) }; }
  catch (err) { return fromApiError(err); }
}
export async function handleUnreadCount(deps: NotificationsRouteDeps): Promise<NotificationHandlerResult> {
  try { return { status: 200, body: await deps.unreadCount() }; }
  catch (err) { return fromApiError(err); }
}
export async function handleMarkRead(id: string, deps: NotificationsRouteDeps): Promise<NotificationHandlerResult> {
  try { await deps.markRead(id); return { status: 204, body: null }; }
  catch (err) { return fromApiError(err); }
}
export async function handleMarkAll(deps: NotificationsRouteDeps): Promise<NotificationHandlerResult> {
  try { return { status: 200, body: await deps.markAllRead() }; }
  catch (err) { return fromApiError(err); }
}
```

- [ ] **Step 5: Create `app/api/notifications/route-deps.ts`** (mirror `orders/route-deps.ts`):

```ts
import 'server-only';
import { liveAuthedDeps } from '@/lib/api-authed';
import { listNotifications, getUnreadCount, markRead, markAllRead } from '@/lib/notifications';
import type { NotificationsRouteDeps } from './handlers';

export function liveNotificationsRouteDeps(): NotificationsRouteDeps {
  return {
    list: async (query) => listNotifications(query, await liveAuthedDeps()),
    unreadCount: async () => getUnreadCount(await liveAuthedDeps()),
    markRead: async (id) => markRead(id, await liveAuthedDeps()),
    markAllRead: async () => markAllRead(await liveAuthedDeps()),
  };
}
```

- [ ] **Step 6: Write `handlers.test.ts`** (mock a `NotificationsRouteDeps`; assert each handler delegates + status; `handleMarkRead` → 204; an `ApiAuthError` maps to its status):

```ts
import { describe, it, expect, vi } from 'vitest';
import { ApiAuthError } from '@/lib/api-auth';
import { handleList, handleUnreadCount, handleMarkRead, handleMarkAll, type NotificationsRouteDeps } from './handlers';

function deps(over: Partial<NotificationsRouteDeps> = {}): NotificationsRouteDeps {
  return {
    list: vi.fn().mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0, totalPages: 1 }),
    unreadCount: vi.fn().mockResolvedValue({ count: 0 }),
    markRead: vi.fn().mockResolvedValue(undefined),
    markAllRead: vi.fn().mockResolvedValue({ updated: 0 }),
    ...over,
  };
}

describe('notification handlers', () => {
  it('handleList returns 200 + body', async () => {
    expect(await handleList({}, deps())).toEqual({ status: 200, body: expect.objectContaining({ data: [] }) });
  });
  it('handleMarkRead returns 204', async () => {
    expect(await handleMarkRead('n1', deps())).toEqual({ status: 204, body: null });
  });
  it('maps ApiAuthError to its status', async () => {
    const d = deps({ unreadCount: vi.fn().mockRejectedValue(new ApiAuthError('nope', 401)) });
    expect(await handleUnreadCount(d)).toEqual({ status: 401, body: { message: 'nope' } });
  });
  it('handleMarkAll returns the updated count', async () => {
    const d = deps({ markAllRead: vi.fn().mockResolvedValue({ updated: 4 }) });
    expect(await handleMarkAll(d)).toEqual({ status: 200, body: { updated: 4 } });
  });
});
```

- [ ] **Step 7: Create the four `route.ts` files.**

`app/api/notifications/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { handleList } from './handlers';
import { liveNotificationsRouteDeps } from './route-deps';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const num = (k: string) => { const v = url.searchParams.get(k); return v === null ? undefined : Number(v); };
  const unreadRaw = url.searchParams.get('unread');
  const result = await handleList(
    { page: num('page'), pageSize: num('pageSize'), unread: unreadRaw === null ? undefined : unreadRaw === 'true' },
    liveNotificationsRouteDeps(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
```

`app/api/notifications/unread-count/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { handleUnreadCount } from '../handlers';
import { liveNotificationsRouteDeps } from '../route-deps';

export async function GET() {
  const result = await handleUnreadCount(liveNotificationsRouteDeps());
  return NextResponse.json(result.body, { status: result.status });
}
```

`app/api/notifications/read-all/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { handleMarkAll } from '../handlers';
import { liveNotificationsRouteDeps } from '../route-deps';

export async function PATCH() {
  const result = await handleMarkAll(liveNotificationsRouteDeps());
  return NextResponse.json(result.body, { status: result.status });
}
```

`app/api/notifications/[id]/read/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { handleMarkRead } from '../../handlers';
import { liveNotificationsRouteDeps } from '../../route-deps';

export async function PATCH(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await handleMarkRead(id, liveNotificationsRouteDeps());
  // 204 must not carry a JSON body
  if (result.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(result.body, { status: result.status });
}
```

> Verify the params-as-Promise signature against an existing dynamic route in this app (e.g. `app/api/cart/items/[productId]/route.ts`) — match whatever shape it uses (Next 15/16 uses `Promise<params>`; if this app's existing dynamic routes use sync params, match that instead).

- [ ] **Step 8: Run the client + handler tests + confirm no build break**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/storefront && npx vitest run src/lib/notifications.test.ts src/app/api/notifications/handlers.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/storefront/src/lib/notifications.ts apps/storefront/src/lib/notifications.test.ts apps/storefront/src/app/api/notifications
git commit -m "feat(storefront-notifications): server-only client + same-origin proxy route handlers"
```

---

### Task 3: Browser fetch wrapper + NotificationBell island

**Files:**
- Create: `apps/storefront/src/lib/notifications-client.ts`, `.../notifications-client.test.ts`
- Create: `apps/storefront/src/components/notifications/NotificationBell.tsx`, `.../NotificationBell.test.tsx`

**Interfaces:**
- Consumes: `notificationText`/`relativeTime` (Task 1); the same-origin routes (Task 2).
- Produces:
  - `notifications-client.ts` (browser-safe, NO `server-only`): `fetchUnreadCount(): Promise<number>`, `fetchNotifications(): Promise<NotificationView[]>`, `postMarkRead(id): Promise<void>`, `postMarkAll(): Promise<void>` — each `fetch`ing the `/api/notifications*` routes; on non-ok, throw or return a degraded value per the spec (list/count degrade to `[]`/`0`; mark propagates).
  - `NotificationBell()` client component.

- [ ] **Step 1: Create `notifications-client.ts`** (browser fetch, degrade-on-failure for reads):

```ts
export interface NotificationView {
  id: string; type: string; payload: unknown; readAt: string | null; createdAt: string;
}

export async function fetchUnreadCount(): Promise<number> {
  try {
    const res = await fetch('/api/notifications/unread-count');
    if (!res.ok) return 0;
    const body = (await res.json()) as { count?: number };
    return body.count ?? 0;
  } catch { return 0; }
}

export async function fetchNotifications(): Promise<NotificationView[]> {
  try {
    const res = await fetch('/api/notifications?pageSize=10');
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: NotificationView[] };
    return body.data ?? [];
  } catch { return []; }
}

export async function postMarkRead(id: string): Promise<void> {
  await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
}
export async function postMarkAll(): Promise<void> {
  await fetch('/api/notifications/read-all', { method: 'PATCH' });
}
```

- [ ] **Step 2: Write `notifications-client.test.ts`** (mock global `fetch`): unread-count parses `count`; degrades to 0 on non-ok/throw; list parses `data`; degrades to `[]`; mark calls the right path/verb.

- [ ] **Step 3: Run — `npx vitest run src/lib/notifications-client.test.ts` → PASS.**

- [ ] **Step 4: Write the failing `NotificationBell.test.tsx`** (RTL; mock `./notifications-client` — wait, the bell imports from `@/lib/notifications-client`; mock that module). Cover: badge renders the unread count from `fetchUnreadCount` on mount; hidden when 0; opening calls `fetchNotifications` + renders rows (unread row shows the dot/distinct treatment, read row muted) with `notificationText` copy; clicking an unread row calls `postMarkRead` + decrements the badge; "Mark all read" calls `postMarkAll` + zeroes the badge; empty → "No notifications yet"; `aria-expanded` toggles; Esc closes.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/notifications-client', () => ({
  fetchUnreadCount: vi.fn(),
  fetchNotifications: vi.fn(),
  postMarkRead: vi.fn(),
  postMarkAll: vi.fn(),
}));
import * as client from '@/lib/notifications-client';
import { NotificationBell } from './NotificationBell';

const c = client as unknown as Record<string, ReturnType<typeof vi.fn>>;

function row(over = {}) {
  return { id: 'n1', type: 'SHIPPING_UPDATE', payload: {}, readAt: null, createdAt: new Date().toISOString(), ...over };
}

describe('NotificationBell', () => {
  beforeEach(() => {
    c.fetchUnreadCount.mockReset().mockResolvedValue(2);
    c.fetchNotifications.mockReset().mockResolvedValue([row(), row({ id: 'n2', type: 'ORDER_CONFIRMATION', readAt: new Date().toISOString() })]);
    c.postMarkRead.mockReset().mockResolvedValue(undefined);
    c.postMarkAll.mockReset().mockResolvedValue(undefined);
  });

  it('shows the unread badge from mount', async () => {
    render(<NotificationBell />);
    expect(await screen.findByLabelText(/2 unread/i)).toBeInTheDocument();
  });

  it('opening fetches + renders rows with friendly copy', async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(await screen.findByText('Your order has shipped')).toBeInTheDocument();
    expect(screen.getByText('Your order was placed')).toBeInTheDocument();
  });

  it('clicking an unread row marks it read and decrements', async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await userEvent.click(await screen.findByText('Your order has shipped'));
    await waitFor(() => expect(c.postMarkRead).toHaveBeenCalledWith('n1'));
  });

  it('mark all read zeroes the badge', async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await userEvent.click(await screen.findByRole('button', { name: /mark all read/i }));
    await waitFor(() => expect(c.postMarkAll).toHaveBeenCalled());
  });

  it('empty state', async () => {
    c.fetchNotifications.mockResolvedValue([]);
    c.fetchUnreadCount.mockResolvedValue(0);
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(await screen.findByText(/no notifications yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run to verify it fails** — cannot resolve `./NotificationBell`.

- [ ] **Step 6: Implement `NotificationBell.tsx`** (`'use client'`). State: `open`, `unread`, `items`, `loading`. `useEffect` on mount → `fetchUnreadCount` → `setUnread`. Toggle button (`aria-label="Notifications"`, `aria-expanded={open}`, `aria-haspopup`); on open → `fetchNotifications` → `setItems`. Dropdown (`role` list): header ("Notifications" + a "Mark all read" `<button>` when `unread>0`); rows via `notificationText(type,payload)` + `relativeTime(createdAt)` — unread (`readAt===null`) get a coral dot + tint, read are muted; clicking an unread row → `postMarkRead(id)` then set that row's `readAt` locally + `setUnread(u => Math.max(0, u-1))`; "Mark all read" → `postMarkAll()` then set all rows read + `setUnread(0)`; empty → "No notifications yet". Badge: hidden when `unread<=0`, shows `unread>9 ? '9+' : unread`, `aria-label={`${unread} unread notifications`}`, coral tokens (mirror `CartCountBadge`: `bg-primary-500 text-surface` — verify dark). Esc + click-outside close (mirror `SearchAutocomplete`). No `any`.

- [ ] **Step 7: Run to verify it passes** — `npx vitest run src/components/notifications/NotificationBell.test.tsx` → PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/storefront/src/lib/notifications-client.ts apps/storefront/src/lib/notifications-client.test.ts apps/storefront/src/components/notifications
git commit -m "feat(storefront-notifications): NotificationBell island + browser fetch client"
```

---

### Task 4: Wire the bell into the header + build

**Files:**
- Modify: `apps/storefront/src/components/layout/SiteHeaderView.tsx`

**Interfaces:**
- Consumes: `NotificationBell` (Task 3); `user` (already a prop).

- [ ] **Step 1: Render the bell** in `SiteHeaderView.tsx`'s "Right zone" flex row, only for a signed-in user. Import `NotificationBell` and place `{user && <NotificationBell />}` inside that `<div className="flex items-center justify-end gap-2">`, before the `{user ? (...account...) : (...auth...)}` block (so it sits after the cart, next to account — matching the mockup). Do NOT change the cart/theme/auth markup.

- [ ] **Step 2: Run the header + related tests**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/storefront && npx vitest run src/components/layout`
Expected: PASS. If `SiteHeaderView.test.tsx` asserts an exact header structure, extend it to allow the bell for a signed-in user (mock `NotificationBell` or the client module so the header test doesn't fetch).

- [ ] **Step 3: Full suite + build (the server-only-leak gate)**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/storefront && npx vitest run && npm run build`
Expected: whole storefront suite green; `next build` clean — **no `server-only` import pulled into a client bundle** (the bell imports only `notifications-client` + `notification-messages`; if the build errors with a server-only-in-client message, the bell is transitively importing `lib/notifications.ts`/`api-authed` — fix the import).

- [ ] **Step 4: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/storefront/src/components/layout/SiteHeaderView.tsx
git commit -m "feat(storefront-notifications): render NotificationBell in the header for signed-in users"
```

---

### Task 5: Light/dark browser smoke + final gate

**Files:** none (verification only).

- [ ] **Step 1: Ensure the API is running** fresh against `ecom_dev` (per the stale-`:5000` memory) so the storefront has real notifications. From `apps/api`: `npm run start:dev` (background). The S2/S3 smokes create notification rows; if a fresh customer has none, register + place an order (via the storefront or curl) to generate `REGISTRATION_CONFIRMATION` + `ORDER_CONFIRMATION` for that user.

- [ ] **Step 2: Run the storefront** (`apps/storefront`, `npm run dev` → `:5001`). Sign in as a customer who has notifications.

- [ ] **Step 3: Smoke — both themes (RULE.md §10).** For **light AND dark** (toggle theme, screenshot each):
  - The bell shows the coral unread-count badge (matches the S1 unread count).
  - Open the dropdown → rows with per-type friendly copy + relative time; unread rows have the coral dot + tint, read rows muted; "Mark all read" present.
  - Click an unread row → it becomes read (dot/tint gone) and the badge decrements; the API reflects `readAt` (spot-check via the feed or `psql`).
  - "Mark all read" → badge clears (→ hidden), rows all muted.
  - Sign out (or view as guest) → the bell is not rendered.
  - Confirm the badge + dropdown + "Mark all read" are legible in dark (coral-on-dark; no wash-out).

- [ ] **Step 4: Final gate** — from `apps/storefront`: `npx vitest run && npm run build` both clean. Stop the dev servers.

- [ ] **Step 5: STOP and report** (RULE.md §1) — do NOT start S4b. Summary, files, both-theme screenshots described, and the RULE.md §6 resume prompt. After user verification, merge `feat/notifications-ui` → `main` locally and flip M4b S4a in the roadmap.

---

## Verification (whole slice)

- `npx vitest run` (whole storefront suite) green, incl. the message mapper, server-only client, route handlers, browser client, and `NotificationBell` island tests, plus the updated header test.
- `npm run build` (`next build`) clean — **no `server-only` leak** into the client bundle (the bell imports only the browser fetch client + pure mapper).
- Browser smoke in BOTH themes: badge reflects unread count; dropdown shows per-type copy + relative time + unread/read treatment; mark-one decrements; mark-all clears; signed-out shows no bell; coral badge/dropdown legible in dark.
- No API/backend/DB change (consumption-only). No polling.
- Known scope: dropdown-only (no history page); S4b (admin/seller feed) deferred.
```
