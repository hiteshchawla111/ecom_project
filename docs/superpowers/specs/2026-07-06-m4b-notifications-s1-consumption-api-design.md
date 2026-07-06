# M4b S1 — Notifications Consumption API — Design

> **Date:** 2026-07-06
> **Phase:** M4b (of the M4 Reviews + Notifications parallel group) — `docs/IMPLEMENTATION_PLAN.md`.
> **Branch:** `feat/notifications` (off `main`; independent of M4a per the dependency graph — M4b needs only M1).
> **Status:** Approved design. Implement one slice, stop-and-verify (RULE.md §1); TDD the query/scoping logic (RULE.md §4); smoke-run the real thing vs `ecom_dev` (RULE.md §5).

## Context

M4b generalizes the event→notification pipeline and adds the consumption UX. It is **XL**, so it is sliced:

- **S1 — Consumption API (this spec):** the read/consume side — a role-aware, owner-scoped API over the `Notification` rows already written today.
- **S2 — Emitters + enum cleanup:** add missing domain emitters (`auth.registered`, `order.placed`/NEW_ORDER, shipping/delivery, refund) + listeners; add `SELLER_*` `NotificationType` values and drop the temporary `payload.kind` workaround (`notifications.service.ts:86-131`).
- **S3 — NotificationChannel provider:** mock email/SMS channel seam (ADR-010) wired into listeners.
- **S4 — Feed UI:** badge + feed + mark-read in storefront + admin/seller, consuming S1's API.

**Current state (verified in code).** The `notifications` module has a `NotificationsService` (write-only: `recordLowStock`, `recordNewReview`, `recordSellerRegistered`, `recordSellerKyc`), three `@OnEvent` listeners (low-stock, review, seller), and a module — but **no controller and no read/mark-read methods**. The `Notification` model already carries everything S1 needs:

```prisma
model Notification {
  id        String  @id @default(cuid())
  userId    String?          // null = staff/admin-queue; else a specific user
  type      NotificationType
  payload   Json
  readAt    DateTime?        // null = unread
  createdAt DateTime @default(now())
  @@index([userId, createdAt])   // supports the personal-feed query
  @@index([type])
}
```

**No DB change in S1** — the schema and indexes already support the queries. Global guards are already in place: `JwtAuthGuard` + `RolesGuard` are app-wide `APP_GUARD`s, so every route is authenticated unless `@Public()`. `@CurrentUser() user: AccessTokenPayload` supplies `{ sub, email, role }`.

## Decisions (approved)

1. **Slice S1 = consumption API only.** No new emitters, no channel provider, no UI. Purely additive; ships on notifications already being written (low-stock, new-review, seller events).
2. **Role-aware, owner-scoped feed via one visibility rule.** A caller sees their own notifications (`userId = me`) plus, **only if staff (ADMIN or INVENTORY_MANAGER)**, the shared staff queue (`userId = null`). Customers/sellers see only their own. One endpoint, one `visibilityWhere` reused by every operation so list/count/mark-read can never diverge.
3. **Endpoint set:** list + unread-count + mark-one + mark-all (the full feed+badge surface S4 needs).
4. **Shared-queue mark-read is global for S1.** A `userId=null` row is a single shared row; marking it read sets `readAt` for all staff. Per-staff read-state (a join table) is **out of scope** (YAGNI) — noted as a known limitation.

## Architecture / boundaries

All within `apps/api/src/notifications/`, mirroring existing module + the orders controller/service/DTO conventions:

```
apps/api/src/notifications/
  notifications.controller.ts        // NEW — @Controller('notifications'), authed, @CurrentUser
  notifications.controller.spec.ts   // NEW
  dto/list-notifications.dto.ts       // NEW — page/pageSize + optional `unread`
  notifications.service.ts            // EXTEND — add list/unreadCount/markRead/markAllRead (keep recordX)
  notifications.service.spec.ts       // EXTEND
  notifications.module.ts             // EXTEND — register the controller
```

Read methods live beside the existing `recordX` writers (same bounded context; file ~130 lines, stays focused). No other module is touched.

### The visibility rule (single source of truth)

```ts
// Reused by list, unreadCount, markRead, markAllRead — so they can never diverge.
function visibilityWhere(user: AccessTokenPayload): Prisma.NotificationWhereInput {
  const isStaff = user.role === Role.ADMIN || user.role === Role.INVENTORY_MANAGER;
  return isStaff
    ? { OR: [{ userId: user.sub }, { userId: null }] }
    : { userId: user.sub };
}
```

## API surface

`@Controller('notifications')`. Authed by the global `JwtAuthGuard`; **no class-level `@Roles`** — every authenticated role has a personal feed, and *scoping* (not a role gate) differentiates them. `@CurrentUser()` supplies the actor.

| Method | Route | Behavior |
|---|---|---|
| `GET` | `/notifications` | Paginated list within `visibilityWhere`, `orderBy createdAt desc`. Query: `page` (int ≥1, default 1), `pageSize` (int 1–100, default 20), `unread` (optional bool → adds `readAt: null`). Returns `Paginated<NotificationView>`. |
| `GET` | `/notifications/unread-count` | `{ count }` = `count(visibilityWhere AND readAt: null)`. Backs the badge. **Declared before `:id` routes.** |
| `PATCH` | `/notifications/:id/read` | Mark one read: `updateMany({ where: { id, ...visibilityWhere }, data: { readAt: now } })`. Idempotent (re-marking a visible row is a harmless no-op write, count 1). Count 0 ⇒ id not visible/absent ⇒ **404**. Returns **204**. |
| `PATCH` | `/notifications/read-all` | `updateMany({ where: { ...visibilityWhere, readAt: null }, data: { readAt: now } })`. Returns `{ updated }`. **Declared before `:id`.** |

**`NotificationView`** = `{ id: string; type: NotificationType; payload: unknown; readAt: Date | null; createdAt: Date }`. `payload` is the stored event JSON passed through as-is (S4 renders per `type`). No PII: payloads carry IDs + scalars only (event conventions), and every returned row is visibility-scoped.

**`Paginated<T>`** = `{ data: T[]; page: number; pageSize: number; total: number; totalPages: number }` — the repo-wide per-service envelope (mirror `orders.service.ts` `listOrders`).

### Why `updateMany` for single mark-read

`update` keys only on a unique field, so it can't also enforce `visibilityWhere` atomically — that would need read-check-write (TOCTOU + extra round trip). `updateMany({ where: { id, ...visibility } })` enforces ownership **and** idempotency in one statement; `count === 0` cleanly means "not yours / missing" → the controller throws `NotFoundException`.

## Service methods (signatures)

```ts
interface Paginated<T> { data: T[]; page: number; pageSize: number; total: number; totalPages: number }
interface NotificationView { id: string; type: NotificationType; payload: unknown; readAt: Date | null; createdAt: Date }

list(user: AccessTokenPayload, dto: ListNotificationsDto): Promise<Paginated<NotificationView>>;
unreadCount(user: AccessTokenPayload): Promise<{ count: number }>;
markRead(user: AccessTokenPayload, id: string): Promise<boolean>;   // false ⇒ controller 404s
markAllRead(user: AccessTokenPayload): Promise<{ updated: number }>;
```

The controller maps `markRead → false` to `NotFoundException` and returns 204 on success; all other methods return their value directly.

## Data flow

`GET /notifications` → controller (`@CurrentUser`, `@Query() dto`) → `service.list(user, dto)` → `visibilityWhere(user)` (+ `readAt:null` if `unread`) → `Promise.all([findMany(skip/take/orderBy), count])` → envelope. Mark-read/all → `updateMany` scoped by `visibilityWhere`. No transactions needed (single-statement reads/writes).

## Testing (TDD — API Jest, mirror `notifications.service.spec.ts` + orders controller spec)

**Service (`notifications.service.spec.ts`, extend; Prisma mocked):**
- `list`: customer → `where { userId: me }`; admin → `where { OR:[{userId:me},{userId:null}] }`; `unread:true` adds `readAt:null`; pagination (`skip=(page-1)*pageSize`, `totalPages=max(1,ceil(total/pageSize))`, envelope); `orderBy { createdAt: 'desc' }`.
- `unreadCount`: `count` with `readAt:null` + visibility; staff includes `userId:null`.
- `markRead`: `updateMany({ where:{ id, ...visibility } })`; returns `count>0`; re-mark of a visible row still matches (no-op, count 1); invisible/missing id → count 0 → false.
- `markAllRead`: `updateMany({ where:{ ...visibility, readAt:null } })`; returns `{ updated: count }`.

**Controller (`notifications.controller.spec.ts`, new; service mocked):**
- each route delegates with `user` + query/param; `GET /notifications` passes the DTO through.
- `PATCH :id/read`: service `false` → `NotFoundException` (404); `true` → 204.
- route-ordering: `unread-count` and `read-all` resolve to their own handlers, not `:id`.

## Verification gate (RULE.md §5)

1. `npm test` (API) — all green incl. new specs; `npx tsc --noEmit` — 0 new errors (3 known pre-existing M2/M3 spec errors unchanged).
2. **Live HTTP smoke vs `ecom_dev`** (real boot; confirm fresh `Mapped {/notifications, GET}` + `{/notifications/:id/read, PATCH}` etc. in the log per the stale-port memory), scripted like `apps/api/scripts/smoke-reviews.sh`:
   - Confirm/seed notifications exist (LOW_STOCK/NEW_REVIEW rows already present from earlier smokes; a delivered-review flow can add more).
   - **Customer:** `GET /notifications` returns only their own; `unread-count` matches; `PATCH :id/read` flips `readAt`; re-PATCH idempotent (204); PATCH a foreign/absent id → 404.
   - **Admin:** feed includes `userId:null` staff rows (low-stock/new-review/seller-registered); `read-all` marks them; unread-count → 0.
   - Unauthenticated → 401.

## Out of scope (YAGNI — S1)

- Per-staff read-state on shared (`userId=null`) queue rows — a join table; deferred.
- Any new emitter / listener (S2); the `payload.kind` enum cleanup (S2).
- NotificationChannel delivery — email/SMS mock (S3).
- Feed/badge UI (S4).
- Delete/archive a notification; notification preferences.

## Risks

- **Cross-user leak** if any endpoint forgets the scope → mitigated by the single `visibilityWhere` reused everywhere + tests asserting the `where` per role.
- **Route capture** (`unread-count`/`read-all` swallowed by `:id`) → declare the literal routes before the param route; a test asserts resolution.
- **Mark-read TOCTOU / marking unseen rows** → single-statement `updateMany` scoped by visibility; count-based 404.
- **Shared-queue read-state** reads globally for staff — accepted for S1, documented; revisit if product wants per-staff state.
