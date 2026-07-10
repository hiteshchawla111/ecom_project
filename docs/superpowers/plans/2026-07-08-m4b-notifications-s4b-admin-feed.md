# M4b S4b — Admin/Seller Notification Feed + Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the admin app's header notification bell + unread badge + dropdown (staff-scoped feed, mark-one/mark-all), consuming the merged S1 API directly via `apiClient` — on branch `feat/notifications-admin`. Last M4b slice.

**Architecture:** Port the approved S4a storefront `NotificationBell`, adapted to the admin stack: a `lib/notifications.ts` client over `apiClient.request<T>` (browser-side auth + refresh; NO route-handler proxy, NO server-only boundary — admin is a client SPA); a staff-oriented `lib/notification-messages.ts`; a `NotificationBell` component reusing admin tokens; wired into `AppShell`'s sticky top header (before `ThemeToggle`), shown for any authenticated staff role.

**Tech Stack:** React + Vite + TypeScript (strict), Vitest + RTL, Tailwind design tokens (theme-aware). Consumption-only — no API/backend/DB change.

## Global Constraints

- **Branch:** `feat/notifications-admin` (off `main` w/ all M4b backend + S4a; spec committed at `ea386a3`). Merge into `main` locally when done (user's workflow) — STOP for the light/dark browser smoke first (RULE.md §1, §10).
- **Consumption-only:** no changes under `apps/api`. Consume S1 as-is.
- **Direct `apiClient` — no proxy, no `server-only`.** `apiClient.request<T>(path, init?)` (`apps/admin/src/lib/apiClient.ts`) handles auth/refresh; a `204` resolves to `undefined` (call as `request<void>`); non-2xx throws `ApiError`/`SessionExpiredError`. Mirror `apps/admin/src/lib/reviews.ts`.
- **Do NOT import `@prisma/client`** into the admin app; `type` is a local string union / `string`.
- **Theme-safe unread tint:** unread rows use `bg-primary-500/10` (translucent, composites over the theme-aware surface) — NEVER a fixed-light bg (`bg-primary-50`) with inverting text (the S4a dark-mode bug). Read rows `text-content-subtle`, no dot. Verify BOTH themes.
- **Badge:** hidden at 0, "9+" over 9, `bg-primary-500 text-surface` (mirror S4a badge), `aria-label` "<n> unread notifications".
- **Fetch on mount + after actions; no polling.**
- **No role gate on the bell** — `AppShell` renders only under `ProtectedRoute` (authed); every staff role has a personal feed (the API scopes it).
- Strict TS, no `any`. Run from `apps/admin` with absolute paths (cwd resets). Test: `npx vitest run <file>`. Build: `npm run build` (`tsc -b` + `vite build`).

---

## File structure

```
apps/admin/src/
  lib/notification-messages.ts              CREATE  staff notificationText(type,payload) + relativeTime(iso,now?)
  lib/notification-messages.test.ts         CREATE
  lib/notifications.ts                      CREATE  apiClient client: fetchUnreadCount/fetchNotifications/markRead/markAllRead + types
  lib/notifications.test.ts                 CREATE
  components/notifications/NotificationBell.tsx      CREATE  bell + badge + dropdown (ports S4a, admin tokens, no 'use client')
  components/notifications/NotificationBell.test.tsx CREATE
  components/AppShell.tsx                    MODIFY  render <NotificationBell/> in the header cluster (before ThemeToggle)
```

**Task order:**
1. Staff message mapper (`notification-messages.ts`) — no deps.
2. `apiClient` client (`notifications.ts`) — over `apiClient`.
3. `NotificationBell` component — ports S4a, uses tasks 1+2.
4. Wire into `AppShell` + full build.
5. Light/dark browser smoke (ADMIN + SELLER) + final gate → STOP for verification.

---

### Task 1: Staff message mapper + relative time

**Files:**
- Create: `apps/admin/src/lib/notification-messages.ts`, `apps/admin/src/lib/notification-messages.test.ts`

**Interfaces:**
- Produces: `notificationText(type: string, payload: unknown): string`; `relativeTime(iso: string, now?: Date): string`.

- [ ] **Step 1: Write the failing test** `notification-messages.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { notificationText, relativeTime } from './notification-messages';

describe('notificationText (staff copy)', () => {
  it('maps staff types to operator copy', () => {
    expect(notificationText('NEW_ORDER', {})).toBe('New order placed');
    expect(notificationText('LOW_STOCK', {})).toBe('Low stock alert');
    expect(notificationText('NEW_REVIEW', {})).toBe('New product review');
    expect(notificationText('SELLER_REGISTERED', {})).toBe('New seller registered');
    expect(notificationText('SELLER_KYC_APPROVED', {})).toBe('Seller KYC approved');
    expect(notificationText('SELLER_KYC_REJECTED', {})).toBe('Seller KYC rejected');
    expect(notificationText('REGISTRATION_CONFIRMATION', {})).toBe('Welcome');
  });
  it('maps customer types a seller might also receive', () => {
    expect(notificationText('ORDER_CONFIRMATION', {})).toBe('Order placed');
    expect(notificationText('SHIPPING_UPDATE', {})).toBe('Order shipped');
    expect(notificationText('DELIVERY_UPDATE', {})).toBe('Order delivered');
  });
  it('falls back for unknown types', () => {
    expect(notificationText('SOMETHING_NEW', {})).toBe('New notification');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-07-08T12:00:00.000Z');
  it('buckets', () => {
    expect(relativeTime('2026-07-08T11:59:30.000Z', now)).toBe('just now');
    expect(relativeTime('2026-07-08T10:00:00.000Z', now)).toBe('2h ago');
    expect(relativeTime('2026-07-05T12:00:00.000Z', now)).toBe('3d ago');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/admin && npx vitest run src/lib/notification-messages.test.ts` → FAIL (cannot resolve).

- [ ] **Step 3: Implement `notification-messages.ts`:**

```ts
/** Operator-facing copy per notification type (staff surface). */
const MESSAGES: Record<string, string> = {
  NEW_ORDER: 'New order placed',
  LOW_STOCK: 'Low stock alert',
  NEW_REVIEW: 'New product review',
  SELLER_REGISTERED: 'New seller registered',
  SELLER_KYC_APPROVED: 'Seller KYC approved',
  SELLER_KYC_REJECTED: 'Seller KYC rejected',
  REGISTRATION_CONFIRMATION: 'Welcome',
  ORDER_CONFIRMATION: 'Order placed',
  SHIPPING_UPDATE: 'Order shipped',
  DELIVERY_UPDATE: 'Order delivered',
};

/** Friendly copy for a notification; unknown types → a safe generic. */
export function notificationText(type: string, _payload: unknown): string {
  return MESSAGES[type] ?? 'New notification';
}

/** Compact relative time. `now` injectable for deterministic tests. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const secs = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
```

- [ ] **Step 4: Run to verify it passes** — same command → PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/admin/src/lib/notification-messages.ts apps/admin/src/lib/notification-messages.test.ts
git commit -m "feat(admin-notifications): staff per-type message mapper + relative time"
```

---

### Task 2: `apiClient` client

**Files:**
- Create: `apps/admin/src/lib/notifications.ts`, `apps/admin/src/lib/notifications.test.ts`

**Interfaces:**
- Consumes: `apiClient.request<T>(path, init?)` from `./apiClient`.
- Produces:
  - `AdminNotification = { id: string; type: string; payload: unknown; readAt: string | null; createdAt: string }`
  - `fetchUnreadCount(): Promise<number>` (degrade to 0 on error)
  - `fetchNotifications(): Promise<AdminNotification[]>` (first page, `pageSize=10`; degrade to [] on error)
  - `markRead(id: string): Promise<void>`
  - `markAllRead(): Promise<void>`

- [ ] **Step 1: Write the failing test** `notifications.test.ts` (mirror `reviews.test.ts` — mock `./apiClient`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('./apiClient', () => ({ apiClient: { request: vi.fn() } }));
import { apiClient } from './apiClient';
import { fetchUnreadCount, fetchNotifications, markRead, markAllRead } from './notifications';

const req = apiClient.request as unknown as ReturnType<typeof vi.fn>;

describe('admin notifications client', () => {
  beforeEach(() => req.mockReset());

  it('fetchUnreadCount returns the count', async () => {
    req.mockResolvedValue({ count: 4 });
    expect(await fetchUnreadCount()).toBe(4);
    expect(req).toHaveBeenCalledWith('/notifications/unread-count');
  });
  it('fetchUnreadCount degrades to 0 on error', async () => {
    req.mockRejectedValue(new Error('boom'));
    expect(await fetchUnreadCount()).toBe(0);
  });
  it('fetchNotifications returns the first page data', async () => {
    req.mockResolvedValue({ data: [{ id: 'n1', type: 'NEW_ORDER', payload: {}, readAt: null, createdAt: 'x' }], page: 1, pageSize: 10, total: 1, totalPages: 1 });
    const items = await fetchNotifications();
    expect(items).toHaveLength(1);
    expect(req).toHaveBeenCalledWith('/notifications?pageSize=10');
  });
  it('fetchNotifications degrades to [] on error', async () => {
    req.mockRejectedValue(new Error('boom'));
    expect(await fetchNotifications()).toEqual([]);
  });
  it('markRead PATCHes the id route', async () => {
    req.mockResolvedValue(undefined);
    await markRead('n1');
    expect(req).toHaveBeenCalledWith('/notifications/n1/read', { method: 'PATCH' });
  });
  it('markAllRead PATCHes read-all', async () => {
    req.mockResolvedValue({ updated: 3 });
    await markAllRead();
    expect(req).toHaveBeenCalledWith('/notifications/read-all', { method: 'PATCH' });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/notifications.test.ts` → FAIL.

- [ ] **Step 3: Implement `notifications.ts`:**

```ts
import { apiClient } from './apiClient';

/** A notification row (mirrors API NotificationView; dates are JSON strings). */
export interface AdminNotification {
  id: string;
  type: string;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
}

interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Unread count for the badge; degrades to 0 so the header never breaks. */
export async function fetchUnreadCount(): Promise<number> {
  try {
    const res = await apiClient.request<{ count: number }>('/notifications/unread-count');
    return res.count ?? 0;
  } catch {
    return 0;
  }
}

/** First page of the caller's visible notifications; degrades to []. */
export async function fetchNotifications(): Promise<AdminNotification[]> {
  try {
    const res = await apiClient.request<Paginated<AdminNotification>>('/notifications?pageSize=10');
    return res.data ?? [];
  } catch {
    return [];
  }
}

/** Mark one notification read (204). */
export function markRead(id: string): Promise<void> {
  return apiClient.request<void>(`/notifications/${id}/read`, { method: 'PATCH' });
}

/** Mark all the caller's visible notifications read. */
export async function markAllRead(): Promise<void> {
  await apiClient.request<{ updated: number }>('/notifications/read-all', { method: 'PATCH' });
}
```

- [ ] **Step 4: Run to verify it passes** — → PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/admin/src/lib/notifications.ts apps/admin/src/lib/notifications.test.ts
git commit -m "feat(admin-notifications): apiClient notifications client (unread-count/list/mark-read/all)"
```

---

### Task 3: `NotificationBell` component

**Files:**
- Create: `apps/admin/src/components/notifications/NotificationBell.tsx`, `.../NotificationBell.test.tsx`

**Interfaces:**
- Consumes: `fetchUnreadCount`/`fetchNotifications`/`markRead`/`markAllRead`/`AdminNotification` (Task 2); `notificationText`/`relativeTime` (Task 1).
- Produces: `export function NotificationBell()`.

This ports the merged storefront `NotificationBell` (`apps/storefront/src/components/notifications/NotificationBell.tsx`) — SAME structure/behavior/classes — with three adaptations: (a) NO `'use client'` directive (Vite SPA, not Next); (b) it calls the admin `lib/notifications` fns (`fetchUnreadCount`/`fetchNotifications`/`markRead`/`markAllRead`) instead of the storefront's browser-fetch wrapper (same names for `fetch*`; the storefront's `postMarkRead`/`postMarkAll` become `markRead`/`markAllRead` — adjust the two call sites); (c) type is `AdminNotification` from `@/lib/notifications` (or a relative import — match the admin app's import-alias convention; check an existing admin component's imports).

- [ ] **Step 1: Write the failing test** `NotificationBell.test.tsx` (mock `../../lib/notifications`; mirror the storefront bell test + admin RTL harness):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../lib/notifications', () => ({
  fetchUnreadCount: vi.fn(),
  fetchNotifications: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}));
import * as client from '../../lib/notifications';
import { NotificationBell } from './NotificationBell';

const c = client as unknown as Record<string, ReturnType<typeof vi.fn>>;
const row = (o = {}) => ({ id: 'n1', type: 'NEW_ORDER', payload: {}, readAt: null, createdAt: new Date().toISOString(), ...o });

describe('NotificationBell (admin)', () => {
  beforeEach(() => {
    c.fetchUnreadCount.mockReset().mockResolvedValue(2);
    c.fetchNotifications.mockReset().mockResolvedValue([row(), row({ id: 'n2', type: 'LOW_STOCK', readAt: new Date().toISOString() })]);
    c.markRead.mockReset().mockResolvedValue(undefined);
    c.markAllRead.mockReset().mockResolvedValue(undefined);
  });

  it('shows the unread badge from mount', async () => {
    render(<NotificationBell />);
    expect(await screen.findByLabelText(/2 unread/i)).toBeInTheDocument();
  });
  it('opening renders rows with staff copy', async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(await screen.findByText('New order placed')).toBeInTheDocument();
    expect(screen.getByText('Low stock alert')).toBeInTheDocument();
  });
  it('clicking an unread row marks it read + decrements', async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await userEvent.click(await screen.findByText('New order placed'));
    await waitFor(() => expect(c.markRead).toHaveBeenCalledWith('n1'));
  });
  it('mark all read zeroes the badge', async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await userEvent.click(await screen.findByRole('button', { name: /mark all read/i }));
    await waitFor(() => expect(c.markAllRead).toHaveBeenCalled());
  });
  it('empty state', async () => {
    c.fetchNotifications.mockResolvedValue([]);
    c.fetchUnreadCount.mockResolvedValue(0);
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(await screen.findByText(/no notifications/i)).toBeInTheDocument();
  });
  it('aria-expanded toggles and Escape closes', async () => {
    render(<NotificationBell />);
    const btn = screen.getByRole('button', { name: /notifications/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(btn).toHaveAttribute('aria-expanded', 'false'));
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/components/notifications/NotificationBell.test.tsx` → FAIL (cannot resolve).

- [ ] **Step 3: Implement `NotificationBell.tsx`** by porting the storefront component verbatim EXCEPT:
  - Remove the `'use client';` first line (Vite SPA — no directive).
  - Imports: `import { fetchUnreadCount, fetchNotifications, markRead, markAllRead, type AdminNotification } from '@/lib/notifications';` and `import { notificationText, relativeTime } from '@/lib/notification-messages';` (verify `@/` alias resolves in the admin app — check another admin component's imports; if the app uses relative imports, use `../../lib/...`).
  - Type the state as `AdminNotification[]` (was `NotificationView[]`).
  - In `handleRowClick`, call `markRead(item.id)` (was `postMarkRead`); in `handleMarkAll`, call `markAllRead()` (was `postMarkAll`).
  - Keep everything else identical: the mount `useEffect` (`fetchUnreadCount().then(setUnread)`), the open `useEffect` (`fetchNotifications()` with the `cancelled` guard + `setLoaded`), click-outside + Escape effects, the badge (`bg-primary-500 text-surface`, hidden at 0, "9+"), the dropdown markup, and the **unread row class `bg-primary-500/10 text-content`** (already the theme-safe token — do NOT regress to `bg-primary-50`), read rows `text-content-subtle`, the dot, the `BellIcon`. The design tokens (`text-content`, `bg-surface`, `border-line`, `bg-surface-muted`, `text-primary-600`) exist in the admin Tailwind theme (same token names).

- [ ] **Step 4: Run to verify it passes** — → PASS (6 tests). If a matcher misses because of an admin-specific label, fix the matcher to the real label; keep the behavioral assertions.

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/admin/src/components/notifications/NotificationBell.tsx apps/admin/src/components/notifications/NotificationBell.test.tsx
git commit -m "feat(admin-notifications): NotificationBell island (bell + badge + dropdown)"
```

---

### Task 4: Wire into `AppShell` + build

**Files:**
- Modify: `apps/admin/src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `NotificationBell` (Task 3).

- [ ] **Step 1: Render the bell** in `AppShell.tsx`'s header control cluster. Import `NotificationBell` from `./notifications/NotificationBell`, and place `<NotificationBell />` inside `<div className="flex items-center gap-3">` **before** `<ThemeToggle />` (so order is: bell · theme · logout). No role gate (the shell is already behind `ProtectedRoute`). Do NOT change the user-email block, `ThemeToggle`, or `LogoutButton`.

- [ ] **Step 2: Run the AppShell tests**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/admin && npx vitest run src/components/AppShell.test.tsx src/components/AppShell.inventory.test.tsx src/components/AppShell.seller.test.tsx`
Expected: PASS. If any of these render `AppShell` and now trip on the bell doing a real `apiClient` fetch in happy-dom, mock `./notifications/NotificationBell` (or `../lib/notifications`) in that test file so it doesn't fetch; keep the existing nav/role assertions intact.

- [ ] **Step 3: Full suite + build**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/admin && npx vitest run && npm run build`
Expected: whole admin suite green; `tsc -b` + `vite build` clean (only the pre-existing chunk-size advisory, no errors).

- [ ] **Step 4: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/admin/src/components/AppShell.tsx apps/admin/src/components/AppShell.test.tsx
git commit -m "feat(admin-notifications): render NotificationBell in the AppShell header"
```

---

### Task 5: Light/dark browser smoke (ADMIN + SELLER) + final gate

**Files:** none (verification only).

- [ ] **Step 1: Ensure the API is running** fresh against `ecom_dev` (per the stale-`:5000` memory). From `apps/api`: `npm run start:dev` (background); confirm `Mapped {/notifications, GET}` in the log. There are staff-queue rows (`userId:null`: NEW_ORDER/LOW_STOCK/NEW_REVIEW/seller-registered) from prior smokes; if thin, trigger a low-stock or place an order to add some.

- [ ] **Step 2: Run the admin app** (`apps/admin`, `npm run dev` → `:5002`).

- [ ] **Step 3: Smoke — both themes (RULE.md §10).** Toggle theme, screenshot each:
  - Log in as **ADMIN** (`admin@example.com` / `Password123!`): the header bell shows an unread badge whose count includes the shared `userId:null` staff rows; open the dropdown → staff copy ("New order placed", "Low stock alert", "New seller registered", …) + relative time; unread rows have the dot + tint, read rows muted; click an unread row → it marks read + badge decrements; "Mark all read" → badge clears.
  - Log in as a **SELLER** (`seller@example.com` / `Password123!`): the bell shows only that seller's own rows (their KYC/registration + low-stock for their products), NOT another staff member's personal rows (spot-check via the feed or `psql` that no foreign personal row appears).
  - Confirm the badge + dropdown + **unread tint in dark** are legible (the exact S4a wash-out class of bug).

- [ ] **Step 4: Final gate** — from `apps/admin`: `npx vitest run && npm run build` clean. Stop the dev servers.

- [ ] **Step 5: STOP and report** (RULE.md §1). Summary, files, both-theme screenshots described (ADMIN + SELLER), and the RULE.md §6 resume prompt. After user verification, merge `feat/notifications-admin` → `main` locally and flip M4b S4b + **M4 COMPLETE** in the roadmap.

---

## Verification (whole slice)

- `npx vitest run` (whole admin suite) green, incl. the staff mapper, `apiClient` client, `NotificationBell` island, and the updated AppShell test.
- `npm run build` (`tsc -b` + `vite build`) clean.
- Browser smoke in BOTH themes: ADMIN sees the shared staff queue in the badge/dropdown with staff copy; mark-one decrements; mark-all clears; SELLER sees only their own rows; unread tint legible in dark.
- No API/backend/DB change (consumption-only). No polling. Dropdown-only (no history page).
```
