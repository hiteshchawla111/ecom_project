# M4b S4b — Admin/Seller Notification Feed + Badge — Design

> **Date:** 2026-07-08
> **Phase:** M4b (of the M4 Reviews + Notifications group) — `docs/IMPLEMENTATION_PLAN.md`. **Last M4b slice** (with it, all of M4 is complete).
> **Branch:** `feat/notifications-admin` (off `main`; the whole notifications backend + the storefront feed S4a are merged).
> **Status:** Approved design (mirrors the approved S4a dropdown, adapted to admin). One slice; stop-and-verify with a light/dark browser smoke (RULE.md §1, §10). Consumption-only — no API/backend changes.

## Context

S4a shipped the storefront customer notification bell + dropdown. **S4b** is the admin-app counterpart for staff (ADMIN, INVENTORY_MANAGER, SELLER), consuming the same merged S1 API. The S1 API is role-aware: staff see their own rows **plus** the shared `userId: null` staff queue; a seller sees their own rows. S4b just renders that.

**S1 API this consumes** (authed, visibility-scoped by the API):
- `GET /notifications?page&pageSize&unread` → `Paginated<NotificationView>` = `{ data, page, pageSize, total, totalPages }`, `NotificationView = { id, type, payload: unknown, readAt: string|null, createdAt: string }`.
- `GET /notifications/unread-count` → `{ count }`.
- `PATCH /notifications/:id/read` → 204. `PATCH /notifications/read-all` → `{ updated }`.

**Admin patterns to reuse:**
- **`apiClient.request<T>(path, init?)`** (`apps/admin/src/lib/apiClient.ts`) — the browser-side authed client (token store + single-flight refresh-on-401). Admin is a **client SPA**, so the bell calls the S1 endpoints **directly** — no route-handler proxy, no `server-only` boundary (the key simplification vs S4a).
- **`apps/admin/src/lib/reviews.ts`** (from S3) — the exact `apiClient`-client pattern to mirror.
- **`AppShell.tsx`** — a sticky top `<header>` (line ~165) with a right-side control cluster `<div className="flex items-center gap-3">` holding `ThemeToggle`. The bell goes there.
- **`components/ui/*`** primitives + Tailwind design tokens (theme-aware).

## Decisions (approved)

1. **Mirror S4a: header bell + unread badge + dropdown**, in the `AppShell` top header. Dropdown-only (no dedicated page). Shown for any authenticated staff role.
2. **Direct `apiClient` data path** — no proxy, no `server-only` layer (admin is a client SPA; `apiClient` handles auth/refresh). Simpler than S4a.
3. **Staff-oriented per-type mapper** — operator-facing copy for the staff notification types (distinct from S4a's customer copy; separate app, can't share).
4. **Badge freshness: fetch on mount + after actions; no polling** (same as S4a).
5. **Consumption-only** — no API/backend/DB change.

## Architecture / boundaries

```
apps/admin/src/
  lib/notifications.ts                      CREATE  listNotifications/getUnreadCount/markRead/markAllRead over apiClient + types
  lib/notifications.test.ts                 CREATE
  lib/notification-messages.ts              CREATE  staff notificationText(type,payload) + relativeTime(iso,now?)
  lib/notification-messages.test.ts         CREATE
  components/notifications/NotificationBell.tsx      CREATE  bell + badge + dropdown (fetch-on-mount, mark-one/all, Esc/click-outside)
  components/notifications/NotificationBell.test.tsx CREATE
  components/AppShell.tsx                    MODIFY  render <NotificationBell/> in the top-header control cluster (before ThemeToggle)
```

- **`lib/notifications.ts`** — mirror `lib/reviews.ts`: `AdminNotification` (`{ id; type: string; payload: unknown; readAt: string|null; createdAt: string }`), `Paginated<T>` (`{data,page,pageSize,total,totalPages}`), `ListNotificationsQuery` (`{page?;pageSize?;unread?:boolean}`). Functions over `apiClient.request<T>`:
  - `listNotifications(query?) → Paginated<AdminNotification>` (GET, defined-params-only query string).
  - `getUnreadCount() → { count }` (GET).
  - `markRead(id) → void` (PATCH, 204). `markAllRead() → { updated }` (PATCH).
- **`NotificationBell`** — same interaction contract as S4a's island: fetch unread-count on mount → badge; open → `listNotifications({pageSize:10})` → rows; click an unread row → `markRead(id)` + local mark-read + decrement; "Mark all read" (when unread>0) → `markAllRead()` + all read + badge 0; empty → "No notifications"; Esc + click-outside close; `aria-label="Notifications"`, `aria-expanded`, `aria-haspopup`, badge `aria-label`. No proxy — it imports `lib/notifications` (which is browser-safe: `apiClient` is a client module) + `lib/notification-messages`.
- **`AppShell`** — render `<NotificationBell/>` in the header cluster (before `ThemeToggle`), for any authenticated user (the shell only renders when authed; every staff role has a personal feed, so no role gate).

## Staff message mapper

`lib/notification-messages.ts` — pure `notificationText(type: string, payload: unknown): string`:
- `NEW_ORDER` → "New order placed"
- `LOW_STOCK` → "Low stock alert"
- `NEW_REVIEW` → "New product review"
- `SELLER_REGISTERED` → "New seller registered"
- `SELLER_KYC_APPROVED` → "Seller KYC approved" · `SELLER_KYC_REJECTED` → "Seller KYC rejected"
- `REGISTRATION_CONFIRMATION` → "Welcome" (a seller's own registration)
- `ORDER_CONFIRMATION`/`SHIPPING_UPDATE`/`DELIVERY_UPDATE` → mapped too (a SELLER could in principle also be a customer; harmless to cover — "Order placed"/"Order shipped"/"Order delivered") so nothing a staff account receives ever renders blank.
- any unmapped type → "New notification" (generic fallback).
Plus `relativeTime(iso, now?)` — same buckets as S4a (just now / Nm / Nh / Nd), `now` injectable for tests. Duplicated across apps by necessity (separate builds).

## Rendering / theme / a11y (RULE.md §10)

- Rows: `notificationText(type,payload)` + `relativeTime(createdAt)`; **unread** (`readAt===null`) get a dot + a **theme-safe tint** (`bg-primary-500/10` — NOT a fixed-light bg; this is the S4a dark-mode lesson learned) with normal text; **read** rows muted (`text-content-muted`/`-subtle`), no dot.
- Badge: hidden at 0, "9+" over 9, brand token + matching text (mirror how admin badges/`StatusBadge` handle fixed brand color; verify in dark), `aria-label` "<n> unread notifications".
- Dropdown: `role` list, focus-safe, Esc + click-outside close.
- **Both themes verified** in the smoke — especially the unread tint in dark (the exact S4a wash-out class of bug).

## Error / edge handling

- List/count failures degrade quietly (badge hidden / "Couldn't load"); the header never crashes if notifications fail. `apiClient` throws on non-2xx — catch and degrade in the bell.
- Mark-one 404 (already gone) → treat as benign; no error toast.
- Empty feed → "No notifications".

## Testing / verification

- **Vitest + RTL** (mirror admin `lib/reviews.test.ts`, `ReviewsPage.test.tsx`, `SellersPage.test.tsx`):
  - `lib/notifications.test.ts`: each fn → right `apiClient.request` path/verb; list builds the defined-params query; markRead PATCHes `/notifications/:id/read`; markAllRead PATCHes `/notifications/read-all`.
  - `lib/notification-messages.test.ts`: each staff type → its copy; unknown → generic; `relativeTime` buckets (injected now).
  - `NotificationBell.test.tsx`: badge from mocked unread-count on mount; open fetches + renders rows (unread vs read distinct) with staff copy; click unread → `markRead` + decrement; "Mark all read" → `markAllRead` + badge 0; empty state; `aria-expanded` toggles; Esc closes. (Mock `../lib/notifications`.)
- **`tsc -b` + `vite build`** clean.
- **Browser smoke light + dark** vs `ecom_dev` + running admin (RULE.md §10):
  - Log in as **ADMIN** (`admin@example.com`/`Password123!`): bell badge reflects the unread count **including shared `userId:null` staff rows** (NEW_ORDER / LOW_STOCK / NEW_REVIEW / seller-registered exist from prior smokes); open → staff copy; click an unread → decrements; "Mark all read" → clears.
  - Log in as a **SELLER** (`seller@example.com`): sees their own rows (KYC/registration + low-stock for their products), not another staff member's personal rows.
  - Both themes legible (badge + dropdown + unread tint in dark). Screenshot each.

## Out of scope (YAGNI — S4b)

- Full `/notifications` history page + pagination UI — dropdown-only (like S4a).
- Real-time / polling — fetch-on-mount + after-actions only.
- Deep-linking a notification to its order/product/seller admin page — friendly text only (a `payload`-driven link target is a later nicety).
- Preferences, delete/archive, grouping.
- Any backend change.

## Risks

- **Theme wash-out** (the S4a bug) → unread tint uses `bg-primary-500/10` (translucent, composites over the theme-aware surface), never a fixed-light bg with inverting text. Verified in both themes.
- **Cross-user leak** → impossible client-side: the feed is whatever the visibility-scoped S1 API returns for the session (own + staff-queue for staff; own for a seller). The bell renders it verbatim.
- **Role gating** → none needed on the bell itself (every authenticated staff role has a personal feed; scoping is the API's job). The `AppShell` only renders when authed.
- **Staleness** → accepted (no polling); re-fetch on mount + after actions.
- **Cross-app duplication** (`relativeTime`, the `NotificationView`-ish type, the bell shape) with S4a → intentional; the two apps have separate builds and cannot share modules. Not a DRY violation to fix.
