# M4b S4a — Storefront Notification Feed + Badge — Design

> **Date:** 2026-07-07
> **Phase:** M4b (of the M4 Reviews + Notifications group) — `docs/IMPLEMENTATION_PLAN.md`.
> **Branch:** `feat/notifications-ui` (off `main`; the whole notifications backend — S1 consumption API, S2 emitters, S3 channel — is merged).
> **Status:** Approved design (dropdown mockup approved, light + dark). One slice; stop-and-verify with a light/dark browser smoke (RULE.md §1, §10). Consumption-only — no API/backend changes.

## Context

M4b's backend is complete: notifications are written on domain events (S2), delivered via a mock channel (S3), and read through a role-aware consumption API (S1). **S4** is the UI. It's split (approved): **S4a = storefront customer feed + badge (this spec); S4b = admin/seller feed (later).**

**S1 API this consumes** (`apps/api/src/notifications/notifications.controller.ts`, authed, visibility-scoped so a customer only ever gets their own rows):
- `GET /notifications?page&pageSize&unread` → `Paginated<NotificationView>` = `{ data, page, pageSize, total, totalPages }`, `NotificationView = { id, type: NotificationType, payload: unknown, readAt: string | null, createdAt: string }` (Dates serialize to ISO strings over HTTP).
- `GET /notifications/unread-count` → `{ count: number }`.
- `PATCH /notifications/:id/read` → 204 (404 if not visible).
- `PATCH /notifications/read-all` → `{ updated: number }`.

**Storefront patterns to reuse:**
- Same-origin **route-handler proxy** (`src/app/api/*/route.ts`) that forwards to the API server-to-server with the httpOnly session — like `src/app/api/cart/route.ts`, `src/app/api/orders/route.ts`. The browser never sees `API_URL` or tokens.
- **`authedRequest<T>`** (`src/lib/api-authed.ts`) — server-only authed client with refresh-on-401, used inside route handlers.
- **`CartCountBadge`** (`src/components/cart/CartCountBadge.tsx`) — the header client-badge precedent (`'use client'`, absolute-positioned, `bg-primary-500 text-surface`, hidden at 0, `aria-label`).
- **`SearchAutocomplete`** — an existing header client island (combobox with keyboard/ARIA) — the closest precedent for the bell dropdown's interaction/a11y.
- **`SiteHeaderView`** composes the header from these islands.

## Decisions (approved)

1. **Header bell + dropdown panel** (not a dedicated page). A bell icon in the header with a coral unread-count badge; clicking opens a dropdown showing the **first page** of notifications.
2. **Dropdown-only for S4a; no full-history page.** The dropdown shows the latest page; its footer is a quiet status hint ("Showing your latest notifications"), **not** a link to a page that doesn't exist. A full `/account/notifications` history page is a possible later slice — out of scope here.
3. **Badge freshness: fetch on mount + re-fetch after actions.** No polling. The unread count loads when the header island mounts and re-fetches after mark-one / mark-all. A notification arriving mid-session surfaces on the next navigation/refresh.
4. **Per-type message template client-side.** A pure mapper `NotificationType → friendly string` (pulling ids from `payload` where useful); unknown/future types fall back to a generic label. Relative time from `createdAt`. Unread rows visually distinct (coral dot + subtle tint); read rows muted.
5. **Consumption-only.** No API/backend/DB change; consume S1 as-is via a new proxy.

## Architecture / boundaries

```
apps/storefront/src/
  app/api/notifications/route.ts                       CREATE  GET → proxy list (query passthrough: page/pageSize/unread)
  app/api/notifications/unread-count/route.ts          CREATE  GET → proxy unread-count
  app/api/notifications/read-all/route.ts              CREATE  PATCH → proxy mark-all
  app/api/notifications/[id]/read/route.ts             CREATE  PATCH → proxy mark-one
  lib/notifications.ts                                 CREATE  server-only client: listNotifications/getUnreadCount/markRead/markAllRead over authedRequest
  lib/notifications.test.ts                            CREATE
  lib/notification-messages.ts                         CREATE  pure NotificationType→friendly text mapper + relative-time helper
  lib/notification-messages.test.ts                    CREATE
  components/notifications/NotificationBell.tsx        CREATE  'use client' island: bell + badge + dropdown, fetch-on-mount, mark-read/all
  components/notifications/NotificationBell.test.tsx   CREATE
  components/layout/SiteHeaderView.tsx                 MODIFY  render <NotificationBell/> for a signed-in user (next to cart/account)
```

Two boundaries, mirroring the reviews S2 slice:
- **Server edge:** the four route handlers call `authedRequest` (server-only; refresh-on-401). The bell island calls these **same-origin** `/api/notifications*` routes with `fetch` (browser → Next route handler → API). `API_URL`/tokens stay server-side.
- **Client island:** `NotificationBell` owns the open/closed dropdown, the fetched list + unread count, and the mark-read/all actions. It's the only stateful piece.

### Data flow

- **Mount:** `NotificationBell` (rendered only for a signed-in user) fetches `GET /api/notifications/unread-count` → sets the badge. (Cheap; doesn't fetch the list until opened.)
- **Open:** first open fetches `GET /api/notifications?pageSize=10` → renders rows. (Re-open reuses unless a mark action invalidated it — simplest: re-fetch the list on each open.)
- **Mark one:** clicking an unread row → `PATCH /api/notifications/:id/read` → on success, mark that row read locally + decrement the badge (or re-fetch unread-count). Read rows / already-read clicks do nothing destructive.
- **Mark all:** "Mark all read" → `PATCH /api/notifications/read-all` → re-fetch list + unread-count (badge → 0).
- **Signed-out:** the bell is not rendered (the header already knows the current user via `SiteHeaderView`'s `CurrentUser` prop). No unauthenticated fetch.

### Rendering (per-type + time)

`lib/notification-messages.ts` — a pure function `notificationText(type, payload): string`:
- `ORDER_CONFIRMATION` → "Your order was placed"
- `SHIPPING_UPDATE` → "Your order has shipped"
- `DELIVERY_UPDATE` → "Your order was delivered"
- `REGISTRATION_CONFIRMATION` → "Welcome to the shop"
- (customer-reachable types only — the storefront never receives `NEW_ORDER`/`LOW_STOCK`/`NEW_REVIEW`/`SELLER_*` staff rows, but include a **generic fallback** — "You have a new notification" — for any unmapped type so a future/unexpected type never renders blank or a raw enum.)
- Relative time: a small `relativeTime(iso)` helper ("2h ago", "3d ago", "just now"). No date library — plain `Date` math (jsdom-safe: the tests inject a fixed "now").

## Error / edge handling

- **List/count fetch fails** → the bell still renders (no badge, or badge hidden); opening shows a quiet "Couldn't load notifications" state with the panel; failures never crash the header. (Mirrors the reviews GET-degrade posture.)
- **Empty** → dropdown shows "No notifications yet".
- **Mark-one 404** (already-hidden/gone) → treat as success-ish (remove/soft-ignore), never surface an error toast for a benign race.
- **Badge count** hidden when 0 (like `CartCountBadge`); caps display at "9+" over 9 (small visual nicety).

## Theme + a11y (RULE.md §10)

- Bell button: `aria-label="Notifications"`, `aria-expanded`, dropdown `role="menu"`/list with focus management + Esc-to-close + click-outside-to-close (mirror `SearchAutocomplete`'s pattern). Unread badge has an `aria-label` (`"N unread notifications"`).
- **Badge uses the brand coral + literal light text** (`bg-primary-500 text-surface` as `CartCountBadge` does — verify this reads in dark; if it washes out, use `bg-primary-600 text-white` per the theme-safe-buttons rule). Unread dot = `bg-primary-500`. "Mark all read" is a text button in the accent color.
- Verify legibility in **both** themes (screenshots), per the approved mockup.

## Testing / verification

- **Vitest + RTL + happy-dom** (mirror `api-reviews.test.ts` / `SearchAutocomplete.test.tsx`):
  - `lib/notifications.test.ts`: each client fn calls the right same-origin path/verb, passes query through, returns the parsed shape.
  - `lib/notification-messages.test.ts`: each mapped type → its string; unknown type → the generic fallback; `relativeTime` buckets (just now / Nh / Nd) with an injected now.
  - `NotificationBell.test.tsx`: renders the badge from a mocked unread-count; opening fetches + renders rows (unread vs read distinct); clicking an unread row calls mark-one + decrements; "mark all read" calls mark-all + zeroes the badge; empty state; keyboard (Esc closes) + `aria-expanded`.
  - Route handlers: a lightweight test that each proxy forwards to `authedRequest` with the right method/path (mirror the reviews handler test if present, else the cart/orders handler tests).
- **`next build`** clean (no `server-only` leak into a client island — the bell must import only the same-origin fetch layer, never `lib/notifications.ts`/`api-authed` directly).
- **Browser smoke light + dark** vs `ecom_dev` + running storefront (RULE.md §10): sign in as a customer who has notifications (the S2/S3 smokes create some, or trigger via register/order), confirm the badge shows the unread count, open the dropdown (per-type copy + relative time + unread/read treatment), click an unread → it marks read + badge decrements, "mark all read" → badge clears; signed-out → no bell; both themes legible. Screenshot each.

## Out of scope (YAGNI — S4a)

- Admin/seller feed — **S4b**.
- Full `/account/notifications` history page + pagination UI — dropdown-only here.
- Real-time / polling / websockets — fetch-on-mount + after-actions only.
- Notification preferences, delete/archive, grouping.
- Deep-linking a notification to its order/product page — friendly text only for S4a (a `payload`-driven link target is a nice later addition).

## Risks

- **`server-only` leak into the client bundle** → the bell calls same-origin `/api/notifications*` via `fetch`; the `authedRequest`/`API_URL` code lives only in the route handlers. `next build` is the gate (per the storefront-server-only-client-leak memory).
- **Badge staleness** → accepted (no polling, per decision 3); re-fetch after actions + on mount keeps the common path correct.
- **Theme wash-out** → coral badge + literal light text, verified in both themes (the exact `CartCountBadge` token, re-checked in dark).
- **Cross-user leak** → not possible client-side: the feed is whatever the visibility-scoped S1 API returns for the session; the storefront only ever renders the caller's own rows.
- **Unmapped notification type rendering blank** → generic fallback string for any unknown `type`.
