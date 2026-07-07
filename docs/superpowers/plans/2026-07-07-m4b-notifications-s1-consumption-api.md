# M4b — Notifications Consumption API (S1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the read/consume side of notifications — a role-aware, owner-scoped API (list + unread-count + mark-one + mark-all) over the `Notification` rows already written today — on branch `feat/notifications`.

**Architecture:** Extend `NotificationsService` (currently write-only) with read/mark-read methods, all scoped by one shared `visibilityWhere(user)` rule (own rows + the shared staff queue only if ADMIN/INVENTORY_MANAGER), add a new authed `NotificationsController`, register it in the module. No DB change (schema + indexes already support the queries). No new emitters, no channel, no UI — those are M4b S2–S4.

**Tech Stack:** NestJS 11 + TypeScript (strict), Prisma 7 (PostgreSQL `ecom_dev`), Jest, `class-validator`/`class-transformer` DTOs. Global `JwtAuthGuard` + `RolesGuard` (`APP_GUARD`s); `@CurrentUser()` supplies `AccessTokenPayload { sub, email, role }`.

## Global Constraints

- **Branch:** `feat/notifications` (rebased onto `main` which has all M4a; spec committed at `362e423`). Merge into `main` locally when done (user's workflow: merge, don't push-and-ask) — but STOP for the verification gate first (RULE.md §1).
- **Consumption API only.** No new emitters/listeners, no `NotificationChannel`, no UI, no `payload.kind` enum cleanup — all deferred to S2–S4. No DB/schema change.
- **Strict TS, no `any`** in production code. DTOs validated at the boundary.
- **Single visibility rule reused everywhere** (list, unreadCount, markRead, markAllRead) so they can never diverge:
  ```ts
  function visibilityWhere(user: AccessTokenPayload): Prisma.NotificationWhereInput {
    const isStaff = user.role === Role.ADMIN || user.role === Role.INVENTORY_MANAGER;
    return isStaff ? { OR: [{ userId: user.sub }, { userId: null }] } : { userId: user.sub };
  }
  ```
- **`Paginated<T>` = `{ data, page, pageSize, total, totalPages }`**, `totalPages: Math.max(1, Math.ceil(total / pageSize))` — mirror `orders.service.ts`.
- **Route ordering:** declare `unread-count` and `read-all` (literal segments) BEFORE the `:id` param route so they aren't captured.
- **Single mark-read via `updateMany`** scoped by `visibilityWhere` — enforces ownership + idempotency in one statement; `count === 0` ⇒ not visible/absent ⇒ controller throws `NotFoundException` (404). Success ⇒ 204.
- **No PII:** payload is passed through as stored (event conventions carry IDs + scalars); every returned row is visibility-scoped.
- **Run from `apps/api`** with absolute paths (cwd resets). `nest build` masks tsc errors → verify with `npx tsc --noEmit` (expect only the 3 known pre-existing M2/M3 spec errors, 0 new). Dev DB `ecom_dev`, user `sotsys033`, no password; fresh boot on `:5000` (watch the route map per the stale-port memory).

---

## File structure

```
apps/api/src/notifications/
  dto/list-notifications.dto.ts       CREATE  page/pageSize + optional unread (boolean-string)
  notifications.service.ts            EXTEND  + visibilityWhere, list, unreadCount, markRead, markAllRead, NotificationView/Paginated types
  notifications.service.spec.ts       EXTEND  read-method tests (scoping per role, pagination, mark-read semantics)
  notifications.controller.ts         CREATE  @Controller('notifications'), authed, @CurrentUser
  notifications.controller.spec.ts    CREATE  delegation + 404/204 + route-order
  notifications.module.ts             EXTEND  register the controller
```

**Task order (each ends at an independently testable, committable deliverable):**
1. Service read methods + DTO + types (the domain core, TDD).
2. Controller + module registration (HTTP surface + route order, TDD).
3. Live HTTP smoke vs `ecom_dev` + final gate → STOP for user verification.

---

### Task 1: Service read methods + DTO + types

**Files:**
- Create: `apps/api/src/notifications/dto/list-notifications.dto.ts`
- Modify: `apps/api/src/notifications/notifications.service.ts`
- Test: `apps/api/src/notifications/notifications.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (already injected), `AccessTokenPayload` from `../auth/auth-tokens`, `Role`/`Prisma` from `@prisma/client`.
- Produces (add to `notifications.service.ts`, exported):
  - `interface Paginated<T> { data: T[]; page: number; pageSize: number; total: number; totalPages: number }`
  - `interface NotificationView { id: string; type: NotificationType; payload: unknown; readAt: Date | null; createdAt: Date }`
  - `NotificationsService.list(user: AccessTokenPayload, dto: ListNotificationsDto): Promise<Paginated<NotificationView>>`
  - `NotificationsService.unreadCount(user: AccessTokenPayload): Promise<{ count: number }>`
  - `NotificationsService.markRead(user: AccessTokenPayload, id: string): Promise<boolean>` (false ⇒ not visible/absent)
  - `NotificationsService.markAllRead(user: AccessTokenPayload): Promise<{ updated: number }>`
  - a module-private `visibilityWhere(user)` (not exported).

- [ ] **Step 1: Create the DTO** `apps/api/src/notifications/dto/list-notifications.dto.ts` (mirror `orders/dto/list-orders.dto.ts`; `unread` arrives as a query string):

```ts
import { IsBooleanString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Query for the notification feed. Query params arrive as strings. */
export class ListNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  /** When 'true', restrict to unread (readAt: null). Query string → validated as boolean-string. */
  @IsOptional()
  @IsBooleanString()
  unread?: string; // 'true' | 'false'
}
```

- [ ] **Step 2: Write the failing service tests.** Extend `notifications.service.spec.ts` (open it first to match the existing Prisma-mock harness — how `prisma` + `service` are constructed). Add a `describe('read methods', …)` covering:

```ts
// list — scoping per role
it('list scopes a CUSTOMER to their own rows', async () => {
  prisma.notification.findMany.mockResolvedValue([]);
  prisma.notification.count.mockResolvedValue(0);
  await service.list({ sub: 'u1', email: 'c@x', role: Role.CUSTOMER }, {});
  expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { userId: 'u1' },
    orderBy: { createdAt: 'desc' },
    skip: 0,
    take: 20,
  }));
});

it('list includes the shared staff queue for ADMIN', async () => {
  prisma.notification.findMany.mockResolvedValue([]);
  prisma.notification.count.mockResolvedValue(0);
  await service.list({ sub: 'a1', email: 'a@x', role: Role.ADMIN }, {});
  expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { OR: [{ userId: 'a1' }, { userId: null }] },
  }));
});

it('list adds readAt:null when unread="true"', async () => {
  prisma.notification.findMany.mockResolvedValue([]);
  prisma.notification.count.mockResolvedValue(0);
  await service.list({ sub: 'u1', email: 'c@x', role: Role.CUSTOMER }, { unread: 'true' });
  expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { userId: 'u1', readAt: null },
  }));
});

it('list returns the paginated envelope with totalPages', async () => {
  prisma.notification.findMany.mockResolvedValue([
    { id: 'n1', type: NotificationType.LOW_STOCK, payload: { productId: 'p' }, readAt: null, createdAt: new Date('2026-07-01') },
  ]);
  prisma.notification.count.mockResolvedValue(21);
  const res = await service.list({ sub: 'u1', email: 'c@x', role: Role.CUSTOMER }, { page: 2, pageSize: 20 });
  expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
  expect(res).toMatchObject({ page: 2, pageSize: 20, total: 21, totalPages: 2 });
  expect(res.data[0]).toEqual({ id: 'n1', type: NotificationType.LOW_STOCK, payload: { productId: 'p' }, readAt: null, createdAt: new Date('2026-07-01') });
});

// unreadCount
it('unreadCount counts unread within visibility (staff includes userId:null)', async () => {
  prisma.notification.count.mockResolvedValue(3);
  const res = await service.unreadCount({ sub: 'a1', email: 'a@x', role: Role.ADMIN });
  expect(prisma.notification.count).toHaveBeenCalledWith({
    where: { OR: [{ userId: 'a1' }, { userId: null }], readAt: null },
  });
  expect(res).toEqual({ count: 3 });
});

// markRead
it('markRead updateMany-scopes by id + visibility and returns true when a row matched', async () => {
  prisma.notification.updateMany.mockResolvedValue({ count: 1 });
  const ok = await service.markRead({ sub: 'u1', email: 'c@x', role: Role.CUSTOMER }, 'n1');
  expect(prisma.notification.updateMany).toHaveBeenCalledWith({
    where: { id: 'n1', userId: 'u1' },
    data: { readAt: expect.any(Date) },
  });
  expect(ok).toBe(true);
});

it('markRead returns false when no visible row matched (foreign/absent id)', async () => {
  prisma.notification.updateMany.mockResolvedValue({ count: 0 });
  const ok = await service.markRead({ sub: 'u1', email: 'c@x', role: Role.CUSTOMER }, 'nope');
  expect(ok).toBe(false);
});

// markAllRead
it('markAllRead marks all unread within visibility and returns the count', async () => {
  prisma.notification.updateMany.mockResolvedValue({ count: 5 });
  const res = await service.markAllRead({ sub: 'a1', email: 'a@x', role: Role.ADMIN });
  expect(prisma.notification.updateMany).toHaveBeenCalledWith({
    where: { OR: [{ userId: 'a1' }, { userId: null }], readAt: null },
    data: { readAt: expect.any(Date) },
  });
  expect(res).toEqual({ updated: 5 });
});
```

(Import `Role`, `NotificationType` from `@prisma/client`; `ListNotificationsDto` — an empty `{}` is a valid DTO.)

- [ ] **Step 3: Run to verify they fail**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/notifications/notifications.service.spec.ts -t "read methods"`
Expected: FAIL — `service.list` / `unreadCount` / `markRead` / `markAllRead` not functions.

- [ ] **Step 4: Implement.** Add to `notifications.service.ts`. Imports: add `Role` to the existing `@prisma/client` import; add `import type { AccessTokenPayload } from '../auth/auth-tokens';` and `import { ListNotificationsDto } from './dto/list-notifications.dto';`. Add the exported types near the top and the methods to the class:

```ts
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}

/** Own rows always; the shared staff queue (userId:null) only for staff.
 *  Reused by every read/mark op so scoping can never diverge. */
function visibilityWhere(user: AccessTokenPayload): Prisma.NotificationWhereInput {
  const isStaff = user.role === Role.ADMIN || user.role === Role.INVENTORY_MANAGER;
  return isStaff ? { OR: [{ userId: user.sub }, { userId: null }] } : { userId: user.sub };
}
```

Methods (add inside the class, after the `recordX` writers):

```ts
async list(
  user: AccessTokenPayload,
  dto: ListNotificationsDto,
): Promise<Paginated<NotificationView>> {
  const page = dto.page ?? 1;
  const pageSize = dto.pageSize ?? 20;
  const skip = (page - 1) * pageSize;
  const where: Prisma.NotificationWhereInput = { ...visibilityWhere(user) };
  if (dto.unread === 'true') where.readAt = null;

  const [rows, total] = await Promise.all([
    this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
    }),
    this.prisma.notification.count({ where }),
  ]);

  return {
    data: rows.map((r) => ({
      id: r.id,
      type: r.type,
      payload: r.payload,
      readAt: r.readAt,
      createdAt: r.createdAt,
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

async unreadCount(user: AccessTokenPayload): Promise<{ count: number }> {
  const count = await this.prisma.notification.count({
    where: { ...visibilityWhere(user), readAt: null },
  });
  return { count };
}

async markRead(user: AccessTokenPayload, id: string): Promise<boolean> {
  const { count } = await this.prisma.notification.updateMany({
    where: { id, ...visibilityWhere(user) },
    data: { readAt: new Date() },
  });
  return count > 0;
}

async markAllRead(user: AccessTokenPayload): Promise<{ updated: number }> {
  const { count } = await this.prisma.notification.updateMany({
    where: { ...visibilityWhere(user), readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: count };
}
```

> Note: spreading `visibilityWhere(user)` into a new object is required so the `readAt` addition (list) doesn't mutate a shared reference. For the staff `OR` case, `{ ...{ OR: [...] }, readAt: null }` yields `{ OR: [...], readAt: null }` — an AND of the OR-group and the readAt filter, which is correct (Prisma ANDs top-level keys). Confirm the `updateMany` for markRead spreads visibility AFTER `id` so both are present.

- [ ] **Step 5: Run to verify they pass**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/notifications/notifications.service.spec.ts`
Expected: PASS (existing writer tests + the new read-method tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/notifications/notifications.service.ts apps/api/src/notifications/notifications.service.spec.ts apps/api/src/notifications/dto/list-notifications.dto.ts
git commit -m "feat(notifications): consumption read methods (list/unread-count/mark-read/mark-all, visibility-scoped)"
```

---

### Task 2: Controller + module registration

**Files:**
- Create: `apps/api/src/notifications/notifications.controller.ts`
- Create: `apps/api/src/notifications/notifications.controller.spec.ts`
- Modify: `apps/api/src/notifications/notifications.module.ts`

**Interfaces:**
- Consumes: `NotificationsService` (`list`/`unreadCount`/`markRead`/`markAllRead`), `ListNotificationsDto`, `CurrentUser`/`AccessTokenPayload`.
- Produces routes: `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/read-all`, `PATCH /notifications/:id/read`.

- [ ] **Step 1: Write the failing controller spec** `notifications.controller.spec.ts` (mirror an existing thin controller spec; mock `NotificationsService`):

```ts
import { NotFoundException } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { Role } from '@prisma/client';

const USER = { sub: 'u1', email: 'c@x', role: Role.CUSTOMER } as const;

function build() {
  const service = {
    list: jest.fn(),
    unreadCount: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  } as unknown as jest.Mocked<NotificationsService>;
  const controller = new NotificationsController(service);
  return { controller, service };
}

describe('NotificationsController', () => {
  it('GET / delegates to list with the user and dto', async () => {
    const { controller, service } = build();
    const dto = { page: 1 };
    await controller.list(USER, dto);
    expect(service.list).toHaveBeenCalledWith(USER, dto);
  });

  it('GET /unread-count delegates to unreadCount', async () => {
    const { controller, service } = build();
    await controller.unreadCount(USER);
    expect(service.unreadCount).toHaveBeenCalledWith(USER);
  });

  it('PATCH /read-all delegates to markAllRead', async () => {
    const { controller, service } = build();
    await controller.readAll(USER);
    expect(service.markAllRead).toHaveBeenCalledWith(USER);
  });

  it('PATCH /:id/read returns void (204) when the row was marked', async () => {
    const { controller, service } = build();
    service.markRead.mockResolvedValue(true);
    await expect(controller.read(USER, 'n1')).resolves.toBeUndefined();
    expect(service.markRead).toHaveBeenCalledWith(USER, 'n1');
  });

  it('PATCH /:id/read throws NotFoundException when the row was not visible', async () => {
    const { controller, service } = build();
    service.markRead.mockResolvedValue(false);
    await expect(controller.read(USER, 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/notifications/notifications.controller.spec.ts`
Expected: FAIL — cannot find `./notifications.controller`.

- [ ] **Step 3: Implement `notifications.controller.ts`.** No class-level `@Roles` (every authenticated role has a personal feed; scoping differentiates them). Declare literal routes before `:id`.

```ts
import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth-tokens';

/**
 * Personal notification feed for any authenticated user. Visibility is
 * owner-scoped in the service (own rows; staff also see the shared userId:null
 * queue) — not a role gate, so there is no class-level @Roles.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload, @Query() query: ListNotificationsDto) {
    return this.notifications.list(user, query);
  }

  // Literal routes declared before ':id' so they aren't captured by the param route.
  @Get('unread-count')
  unreadCount(@CurrentUser() user: AccessTokenPayload) {
    return this.notifications.unreadCount(user);
  }

  @Patch('read-all')
  readAll(@CurrentUser() user: AccessTokenPayload) {
    return this.notifications.markAllRead(user);
  }

  @Patch(':id/read')
  @HttpCode(204)
  async read(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string): Promise<void> {
    const ok = await this.notifications.markRead(user, id);
    if (!ok) throw new NotFoundException('Notification not found.');
  }
}
```

- [ ] **Step 4: Register the controller** in `notifications.module.ts` — add `controllers: [NotificationsController]` (import it at the top). Keep `providers`/`exports` unchanged.

- [ ] **Step 5: Run the controller spec + full suite + types**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/notifications && npx tsc --noEmit && npx jest`
Expected: notifications specs PASS; `tsc --noEmit` shows only the 3 known pre-existing errors (0 new); full suite green (proves the module + controller bootstrap and DI resolve).

- [ ] **Step 6: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/notifications/notifications.controller.ts apps/api/src/notifications/notifications.controller.spec.ts apps/api/src/notifications/notifications.module.ts
git commit -m "feat(notifications): consumption controller (feed + unread-count + mark-read/all)"
```

---

### Task 3: Live HTTP smoke vs `ecom_dev` + final gate

**Files:**
- Create: `apps/api/scripts/smoke-notifications.sh` (mirror `apps/api/scripts/smoke-reviews.sh`).

**Interfaces:** none (verification only).

- [ ] **Step 1: Boot the API fresh** (avoid a stale `:5000` per the memory). From `apps/api`: `npm run start:dev` (background). Wait for `Mapped {/notifications, GET}`, `{/notifications/unread-count, GET}`, `{/notifications/read-all, PATCH}`, and `{/notifications/:id/read, PATCH}` in the route map before smoking — proves the fresh build serves the new routes AND the literal routes are registered.

- [ ] **Step 2: Write `smoke-notifications.sh`** covering, against `ecom_dev` (there are already `LOW_STOCK`/`NEW_REVIEW`/seller notification rows from earlier smokes; if the tables are thin, trigger a low-stock or post a review to add some):
  - **Unauthenticated** `GET /notifications` → **401**.
  - **Customer** (register/login, or a seeded customer): `GET /notifications` returns only rows with their `userId` (assert no `userId:null` staff rows leak — e.g. the count matches a `psql` count of their own rows). `GET /notifications/unread-count` `{count}` matches. `PATCH /notifications/:id/read` on one of their rows → **204**; `psql` confirms `readAt` set; re-PATCH same id → **204** (idempotent). `PATCH /notifications/:id/read` on a **foreign/absent** id → **404**.
  - **Admin** (`admin@example.com` / `Password123!`): `GET /notifications` includes the shared `userId:null` staff rows (low-stock / new-review / seller-registered). `GET /notifications/unread-count` > 0. `PATCH /notifications/read-all` → `{updated: N}`; then `unread-count` → `{count: 0}`.
  - `?unread=true` on the customer feed returns only unread rows (verify one read row is excluded after marking).

- [ ] **Step 3: Run the smoke**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && bash scripts/smoke-notifications.sh`
Expected: every assertion passes; script exits 0. Report honestly which rows were used/seeded.

- [ ] **Step 4: Final gate** — full suite + types once more; stop the dev server.

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest && npx tsc --noEmit`
Expected: full suite green; 0 new tsc errors.

- [ ] **Step 5: Commit + STOP for verification** (RULE.md §1). Do NOT start S2. Then report: summary, files, the known limitation (shared-queue mark-read is global for staff — per-staff read-state deferred), and the RULE.md §6 resume prompt. After user verification, merge `feat/notifications` → `main` locally.

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/scripts/smoke-notifications.sh
git commit -m "test(notifications): HTTP smoke for the consumption API vs ecom_dev"
```

---

## Verification (whole slice)

- `npx jest` (full API suite) green, incl. new service read-method tests (scoping per role, pagination/totalPages, unread filter, mark-read count semantics) and controller tests (delegation, 204 success, 404 on not-visible, route order).
- `npx tsc --noEmit`: 0 new errors (3 known pre-existing M2/M3 spec errors unchanged).
- `smoke-notifications.sh` green vs a freshly-booted API: 401 unauth; customer sees only own rows (no staff-queue leak); admin sees shared queue; mark-one 204 + idempotent + 404 on foreign id; read-all zeroes the unread count; `unread=true` filters.
- No DB/schema change; no new emitter/channel/UI (S1 scope respected).
- Known limitation recorded: shared `userId:null` queue mark-read is global for staff (per-staff read-state deferred to a later slice).
```
