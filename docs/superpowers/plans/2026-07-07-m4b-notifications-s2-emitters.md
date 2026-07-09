# M4b — Notification Emitters + Enum Cleanup (S2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the M0-available domain emitters (`auth.registered`, `order.placed`, `order.status.changed`) post-commit + their notification listeners, and clean up the seller `payload.kind` workaround with new `SELLER_*` enum values — on branch `feat/notifications-emitters`.

**Architecture:** Producers emit events after their transaction commits (ADR-003, mirroring `inventory.low-stock`); event constants + payloads live with the producing domain (`auth-events.ts`, `orders-events.ts`); the `notifications` module consumes them via new `@OnEvent` listeners → new `NotificationsService.recordX` writers over the existing `Notification` table. An additive migration adds three `SELLER_*` `NotificationType` values; the seller writers switch to them and drop the `payload.kind` discriminator (forward-only).

**Tech Stack:** NestJS 11 + TypeScript (strict), `@nestjs/event-emitter` (global `EventEmitterModule.forRoot()`), Prisma 7 (PostgreSQL `ecom_dev`), Jest.

## Global Constraints

- **Branch:** `feat/notifications-emitters` (off `main` w/ M4a + M4b S1; spec committed at `b7887f5`). Merge into `main` locally when done (user's workflow) — STOP for the verification gate first (RULE.md §1).
- **Post-commit deferred emit (ADR-003):** collect the payload during/after the transaction, `this.events.emit(...)` **after** the `$transaction(...)` resolves — never inside the callback. A rolled-back write must never emit. Mirror the existing low-stock emit in `orders.service.ts` (the `lowStockCrossings` loop after the `$transaction`).
- **Both `AuthService` and `OrdersService` need `EventEmitter2` added to their constructor** (neither has it today; only `inventory.service.ts` does). Import `{ EventEmitter2 } from '@nestjs/event-emitter'`, add `private readonly events: EventEmitter2`. This means their existing `*.service.spec.ts` (which `new` the service directly) must pass an emitter mock `{ emit: jest.fn() } as unknown as EventEmitter2` — update those constructions.
- **Listeners never rethrow:** `@OnEvent` handler wraps the write in `try/catch` + `Logger.error`, exactly like `low-stock.listener.ts`. A failed notification write must not break the originating request.
- **Enum migration is additive + forward-only:** author SQL by file-diff, apply with `npx prisma migrate deploy` (NEVER `migrate reset` — shared `ecom_dev`). The three `ALTER TYPE … ADD VALUE` go in their OWN migration (no other DDL) because Postgres won't allow a newly-added enum value to be used in the same transaction. No data backfill.
- **`order.placed` writes TWO rows:** `NEW_ORDER` (`userId: null`, staff) + `ORDER_CONFIRMATION` (`userId`, customer). Shipping/delivery/registration → the target `userId`.
- Strict TS, no `any` in production code. Run from `apps/api` with absolute paths (cwd resets). `nest build` masks tsc errors → verify with `npx tsc --noEmit` (expect only the 3 known pre-existing M2/M3 spec errors, 0 new).

---

## File structure

```
apps/api/src/
  auth/auth-events.ts                              CREATE  AUTH_REGISTERED + AuthRegisteredEvent
  auth/auth.service.ts                             MODIFY  inject EventEmitter2; emit AUTH_REGISTERED post-create in register()
  auth/auth.service.spec.ts                        MODIFY  emitter mock in ctor; emit / no-emit-on-failure tests
  orders/orders-events.ts                          CREATE  ORDER_PLACED, ORDER_STATUS_CHANGED_EVENT + payloads
  orders/orders.service.ts                         MODIFY  inject EventEmitter2; emit both post-commit
  orders/orders.service.spec.ts                    MODIFY  emitter mock in ctor; emit / no-emit-on-rollback tests
  notifications/notifications.service.ts           MODIFY  + recordRegistration/recordOrderPlaced/recordOrderStatus; SELLER_* in recordSellerRegistered/recordSellerKyc (drop kind)
  notifications/notifications.service.spec.ts      MODIFY  writer tests
  notifications/auth-notification.listener.ts      CREATE  @OnEvent(AUTH_REGISTERED)
  notifications/auth-notification.listener.spec.ts CREATE
  notifications/order-notification.listener.ts     CREATE  @OnEvent(ORDER_PLACED) + @OnEvent(ORDER_STATUS_CHANGED_EVENT)
  notifications/order-notification.listener.spec.ts CREATE
  notifications/seller.listener.ts                 MODIFY  drop the payload.kind NOTE comment (no behavior change here)
  notifications/notifications.module.ts            MODIFY  register the two new listeners
  prisma/schema.prisma                             MODIFY  NotificationType += SELLER_REGISTERED, SELLER_KYC_APPROVED, SELLER_KYC_REJECTED
  prisma/migrations/<ts>_seller_notification_types/migration.sql  CREATE  3× ALTER TYPE ADD VALUE
```

**Task order (each ends at an independently testable, committable deliverable):**
1. Enum migration (`SELLER_*` values) — unblocks the writer switch.
2. Notifications writers: new `recordRegistration`/`recordOrderPlaced`/`recordOrderStatus` + switch seller writers to `SELLER_*` (drop `kind`).
3. `auth.registered` producer + listener.
4. `order.placed` + `order.status.changed` producers + listener.
5. Live HTTP smoke vs `ecom_dev` + final gate → STOP for verification.

---

### Task 1: Enum migration — `SELLER_*` NotificationType values

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_seller_notification_types/migration.sql`

**Interfaces:**
- Produces: `NotificationType.SELLER_REGISTERED`, `.SELLER_KYC_APPROVED`, `.SELLER_KYC_REJECTED` (Prisma client enum values Task 2 uses).

- [ ] **Step 1: Add the three values to the enum** in `schema.prisma` (append after `NEW_REVIEW`):

```prisma
enum NotificationType {
  REGISTRATION_CONFIRMATION
  ORDER_CONFIRMATION
  SHIPPING_UPDATE
  DELIVERY_UPDATE
  NEW_ORDER
  LOW_STOCK
  REFUND_REQUEST
  NEW_REVIEW
  SELLER_REGISTERED
  SELLER_KYC_APPROVED
  SELLER_KYC_REJECTED
}
```

- [ ] **Step 2: Regenerate the client**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx prisma generate`
Expected: "Generated Prisma Client" — no errors.

- [ ] **Step 3: Author the migration by file-diff** (do NOT `migrate dev`). Create `apps/api/prisma/migrations/<timestamp>_seller_notification_types/migration.sql` where `<timestamp>` is a fresh `YYYYMMDDHHMMSS` greater than the latest existing migration dir (check `ls apps/api/prisma/migrations | sort | tail -1`). Contents — the three `ADD VALUE`s alone (no other DDL):

```sql
-- Additive: new NotificationType values for first-class seller notifications
-- (replaces the temporary REGISTRATION_CONFIRMATION + payload.kind workaround).
ALTER TYPE "NotificationType" ADD VALUE 'SELLER_REGISTERED';
ALTER TYPE "NotificationType" ADD VALUE 'SELLER_KYC_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'SELLER_KYC_REJECTED';
```

- [ ] **Step 4: Apply to `ecom_dev`**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx prisma migrate deploy`
Expected: "1 migration applied". No reset.

- [ ] **Step 5: Verify the values exist**

Run: `psql ecom_dev -c '\dT+ "NotificationType"'` (or `psql ecom_dev -tAc "SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='NotificationType' ORDER BY e.enumsortorder;"`)
Expected: the three `SELLER_*` labels present alongside the existing ones.

- [ ] **Step 6: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(notifications): add SELLER_* NotificationType values (additive migration)"
```

---

### Task 2: Notifications writers — new recorders + seller enum switch

**Files:**
- Modify: `apps/api/src/notifications/notifications.service.ts`
- Modify: `apps/api/src/notifications/notifications.service.spec.ts`

**Interfaces:**
- Consumes: `AuthRegisteredEvent` (Task 3), `OrderPlacedEvent`/`OrderStatusChangedEvent` (Task 4) — but to avoid a task-ordering dependency, **define the three payload interfaces inline in this task's event files is wrong**; instead this task imports them. To keep Task 2 self-contained, declare the writer parameter types using **local structural types** matching the event payloads, and Tasks 3/4 pass the matching event objects. Use these exact shapes:
  - registration: `{ userId: string }`
  - order placed: `{ orderId: string; userId: string }`
  - order status: `{ orderId: string; userId: string; status: OrderStatus }`
- Produces (added to `NotificationsService`):
  - `recordRegistration(event: { userId: string }): Promise<void>`
  - `recordOrderPlaced(event: { orderId: string; userId: string }): Promise<void>`
  - `recordOrderStatus(event: { orderId: string; userId: string; status: OrderStatus }): Promise<void>`
  - modified `recordSellerRegistered` / `recordSellerKyc` (now `SELLER_*`, no `kind`).

- [ ] **Step 1: Write the failing writer tests.** Extend `notifications.service.spec.ts` (match the existing Prisma-mock harness). Add:

```ts
describe('recordRegistration', () => {
  it('writes a REGISTRATION_CONFIRMATION for the user', async () => {
    await service.recordRegistration({ userId: 'u1' });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { type: NotificationType.REGISTRATION_CONFIRMATION, userId: 'u1', payload: { userId: 'u1' } },
    });
  });
});

describe('recordOrderPlaced', () => {
  it('writes NEW_ORDER (staff) and ORDER_CONFIRMATION (customer)', async () => {
    await service.recordOrderPlaced({ orderId: 'o1', userId: 'u1' });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { type: NotificationType.NEW_ORDER, userId: null, payload: { orderId: 'o1', userId: 'u1' } },
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { type: NotificationType.ORDER_CONFIRMATION, userId: 'u1', payload: { orderId: 'o1' } },
    });
  });
});

describe('recordOrderStatus', () => {
  it('SHIPPED → SHIPPING_UPDATE for the customer', async () => {
    await service.recordOrderStatus({ orderId: 'o1', userId: 'u1', status: OrderStatus.SHIPPED });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { type: NotificationType.SHIPPING_UPDATE, userId: 'u1', payload: { orderId: 'o1', status: OrderStatus.SHIPPED } },
    });
  });
  it('DELIVERED → DELIVERY_UPDATE for the customer', async () => {
    await service.recordOrderStatus({ orderId: 'o1', userId: 'u1', status: OrderStatus.DELIVERED });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { type: NotificationType.DELIVERY_UPDATE, userId: 'u1', payload: { orderId: 'o1', status: OrderStatus.DELIVERED } },
    });
  });
  it('other statuses write nothing', async () => {
    await service.recordOrderStatus({ orderId: 'o1', userId: 'u1', status: OrderStatus.CONFIRMED });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

// seller enum switch
describe('recordSellerRegistered (SELLER_* switch)', () => {
  it('writes SELLER_REGISTERED with no kind in payload', async () => {
    await service.recordSellerRegistered({ sellerId: 's1', userId: 'u1', displayName: 'Shop' });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { type: NotificationType.SELLER_REGISTERED, userId: null, payload: { sellerId: 's1', userId: 'u1', displayName: 'Shop' } },
    });
  });
});
describe('recordSellerKyc (SELLER_* switch)', () => {
  it('APPROVED → SELLER_KYC_APPROVED, no kind', async () => {
    await service.recordSellerKyc({ sellerId: 's1', userId: 'u1', status: 'ACTIVE' }, 'seller.kyc.approved');
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { type: NotificationType.SELLER_KYC_APPROVED, userId: 'u1', payload: { sellerId: 's1', userId: 'u1', status: 'ACTIVE' } },
    });
  });
});
```

(Import `OrderStatus`, `NotificationType` from `@prisma/client`. The `recordSellerKyc` `kind` arg is the existing `SELLER_KYC_APPROVED`/`SELLER_KYC_REJECTED` string constant.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/notifications/notifications.service.spec.ts`
Expected: FAIL — new methods missing / seller tests expect `SELLER_*`.

- [ ] **Step 3: Implement.** Add `import { OrderStatus } from '@prisma/client'` (extend the existing `@prisma/client` import — `NotificationType`/`Prisma` are already imported). Add the three methods; change the seller writers. New methods:

```ts
async recordRegistration(event: { userId: string }): Promise<void> {
  await this.prisma.notification.create({
    data: {
      type: NotificationType.REGISTRATION_CONFIRMATION,
      userId: event.userId,
      payload: { userId: event.userId },
    },
  });
}

async recordOrderPlaced(event: { orderId: string; userId: string }): Promise<void> {
  // Staff queue (new order to fulfil) + the customer's confirmation.
  await this.prisma.notification.create({
    data: {
      type: NotificationType.NEW_ORDER,
      userId: null,
      payload: { orderId: event.orderId, userId: event.userId },
    },
  });
  await this.prisma.notification.create({
    data: {
      type: NotificationType.ORDER_CONFIRMATION,
      userId: event.userId,
      payload: { orderId: event.orderId },
    },
  });
}

async recordOrderStatus(event: {
  orderId: string;
  userId: string;
  status: OrderStatus;
}): Promise<void> {
  const type =
    event.status === OrderStatus.SHIPPED
      ? NotificationType.SHIPPING_UPDATE
      : event.status === OrderStatus.DELIVERED
        ? NotificationType.DELIVERY_UPDATE
        : null;
  if (!type) return; // S2 notifies only on Shipped/Delivered.
  await this.prisma.notification.create({
    data: {
      type,
      userId: event.userId,
      payload: { orderId: event.orderId, status: event.status },
    },
  });
}
```

Seller writer edits — `recordSellerRegistered`: change `type` to `NotificationType.SELLER_REGISTERED` and the payload to `{ sellerId: event.sellerId, userId: event.userId, displayName: event.displayName }` (drop `kind: SELLER_REGISTERED, ...event`). `recordSellerKyc`: set `type` from `kind` — `kind === SELLER_KYC_APPROVED ? NotificationType.SELLER_KYC_APPROVED : NotificationType.SELLER_KYC_REJECTED` — and payload `{ sellerId: event.sellerId, userId: event.userId, status: event.status, ...(event.reason ? { reason: event.reason } : {}) }` (drop `kind`). Keep the imports of the `SELLER_*` string event-constants (still used to pick the type).

- [ ] **Step 4: Run to verify they pass**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/notifications/notifications.service.spec.ts`
Expected: PASS (existing writer tests updated + new ones).

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/notifications/notifications.service.ts apps/api/src/notifications/notifications.service.spec.ts
git commit -m "feat(notifications): order/registration writers + switch seller writers to SELLER_* (drop payload.kind)"
```

---

### Task 3: `auth.registered` producer + listener

**Files:**
- Create: `apps/api/src/auth/auth-events.ts`
- Modify: `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.service.spec.ts`
- Create: `apps/api/src/notifications/auth-notification.listener.ts`, `apps/api/src/notifications/auth-notification.listener.spec.ts`
- Modify: `apps/api/src/notifications/notifications.module.ts`

**Interfaces:**
- Consumes: `NotificationsService.recordRegistration` (Task 2).
- Produces: `AUTH_REGISTERED = 'auth.registered'`; `interface AuthRegisteredEvent { userId: string }`; `AuthNotificationListener`.

- [ ] **Step 1: Create `auth-events.ts`:**

```ts
/** Fired after a user successfully registers (post-commit). Consumed by notifications. */
export const AUTH_REGISTERED = 'auth.registered';

export interface AuthRegisteredEvent {
  userId: string;
}
```

- [ ] **Step 2: Write the failing producer test.** In `auth.service.spec.ts` — first update the service construction to pass an emitter mock (find every `new AuthService(...)` / Test module provider and add `{ emit: jest.fn() } as unknown as EventEmitter2`; capture the mock so you can assert on it). Add:

```ts
it('emits auth.registered after a successful register', async () => {
  // arrange: prisma.user.findUnique → null (no existing), user.create → { id: 'u1', email, role }
  await service.register({ email: 'a@x.com', name: 'A', password: 'Password123!' } as never);
  expect(emitter.emit).toHaveBeenCalledWith('auth.registered', { userId: 'u1' });
});

it('does NOT emit when registration fails (duplicate email)', async () => {
  // arrange: prisma.user.findUnique → an existing user
  await expect(service.register({ email: 'dup@x.com', name: 'A', password: 'Password123!' } as never)).rejects.toBeInstanceOf(ConflictException);
  expect(emitter.emit).not.toHaveBeenCalled();
});
```

(Match the file's existing mock style for `prisma`, `passwords`, `tokens`. `ConflictException` from `@nestjs/common`.)

- [ ] **Step 3: Run to verify it fails**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/auth/auth.service.spec.ts -t "auth.registered"`
Expected: FAIL — emitter not injected / not called.

- [ ] **Step 4: Implement.** In `auth.service.ts`: add `import { EventEmitter2 } from '@nestjs/event-emitter';` and `import { AUTH_REGISTERED } from './auth-events';`. Add `private readonly events: EventEmitter2,` to the constructor (e.g. after `tokens`, before the `@Inject('RESET_HELPERS')` param — place it so DI still resolves; a plain `EventEmitter2` param is auto-injected). In `register`, after the `user` is created and before `return this.issuePair(...)`:

```ts
const user = await this.prisma.user.create({
  data: { email, name: dto.name, passwordHash, role: Role.CUSTOMER },
});
// Post-commit: the create above has committed; a failed create throws before here.
this.events.emit(AUTH_REGISTERED, { userId: user.id });
return this.issuePair(user.id, user.email, user.role);
```

- [ ] **Step 5: Write the failing listener test** `auth-notification.listener.spec.ts` (mirror `low-stock.listener.spec.ts`):

```ts
import { AuthNotificationListener } from './auth-notification.listener';
import { NotificationsService } from './notifications.service';

describe('AuthNotificationListener', () => {
  it('records a registration notification on the event', async () => {
    const notifications = { recordRegistration: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;
    const listener = new AuthNotificationListener(notifications);
    await listener.handle({ userId: 'u1' });
    expect(notifications.recordRegistration).toHaveBeenCalledWith({ userId: 'u1' });
  });
  it('swallows and logs a failed write', async () => {
    const notifications = { recordRegistration: jest.fn().mockRejectedValue(new Error('db')) } as unknown as NotificationsService;
    const listener = new AuthNotificationListener(notifications);
    await expect(listener.handle({ userId: 'u1' })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 6: Implement the listener** `auth-notification.listener.ts` (copy low-stock's shape):

```ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AUTH_REGISTERED } from '../auth/auth-events';
import type { AuthRegisteredEvent } from '../auth/auth-events';
import { NotificationsService } from './notifications.service';

/** Persists a registration-confirmation notification when a user registers.
 *  Notifications fire on domain events, not inline (CLAUDE.md). */
@Injectable()
export class AuthNotificationListener {
  private readonly logger = new Logger(AuthNotificationListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(AUTH_REGISTERED)
  async handle(event: AuthRegisteredEvent): Promise<void> {
    try {
      await this.notifications.recordRegistration(event);
    } catch (err) {
      this.logger.error(
        `Failed to record registration notification for user ${event.userId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
```

- [ ] **Step 7: Register the listener** in `notifications.module.ts` — add `AuthNotificationListener` to `providers` (import it).

- [ ] **Step 8: Run auth + notifications specs + types**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/auth src/notifications && npx tsc --noEmit`
Expected: PASS; tsc only the 3 known pre-existing errors (0 new).

- [ ] **Step 9: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/auth apps/api/src/notifications/auth-notification.listener.ts apps/api/src/notifications/auth-notification.listener.spec.ts apps/api/src/notifications/notifications.module.ts
git commit -m "feat(notifications): auth.registered emitter + registration notification listener"
```

---

### Task 4: `order.placed` + `order.status.changed` producers + listener

**Files:**
- Create: `apps/api/src/orders/orders-events.ts`
- Modify: `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/orders.service.spec.ts`
- Create: `apps/api/src/notifications/order-notification.listener.ts`, `apps/api/src/notifications/order-notification.listener.spec.ts`
- Modify: `apps/api/src/notifications/notifications.module.ts`

**Interfaces:**
- Consumes: `NotificationsService.recordOrderPlaced`/`recordOrderStatus` (Task 2).
- Produces: `ORDER_PLACED = 'order.placed'`, `ORDER_STATUS_CHANGED_EVENT = 'order.status.changed'`; `interface OrderPlacedEvent { orderId; userId }`; `interface OrderStatusChangedEvent { orderId; userId; status: OrderStatus }`; `OrderNotificationListener`.

> **Naming note:** there is already an audit-action constant `ORDER_STATUS_CHANGED = 'order.status.changed'` in `audit-actions.ts` (a string used for AuditLog). To avoid confusion, name the EVENT constant `ORDER_STATUS_CHANGED_EVENT` and give it the event-bus topic `'order.status.changed'`. They are different concerns (audit vs event bus) but share the topic string harmlessly; keep the distinct symbol names.

- [ ] **Step 1: Create `orders-events.ts`:**

```ts
import { OrderStatus } from '@prisma/client';

/** Fired after an order is successfully placed (post-commit). */
export const ORDER_PLACED = 'order.placed';
export interface OrderPlacedEvent {
  orderId: string;
  userId: string;
}

/** Fired after an order's status transition commits (post-commit). */
export const ORDER_STATUS_CHANGED_EVENT = 'order.status.changed';
export interface OrderStatusChangedEvent {
  orderId: string;
  userId: string;
  status: OrderStatus;
}
```

- [ ] **Step 2: Write the failing producer tests.** In `orders.service.spec.ts` — first add an emitter mock to the service construction (find the `new OrdersService(...)` / Test provider; the constructor is `(prisma, config, inventory, audit)` today → becomes `(prisma, config, inventory, audit, events)`; pass `{ emit: jest.fn() } as unknown as EventEmitter2` and capture it). Add:

```ts
it('emits order.placed after placement commits', async () => {
  // arrange the existing successful-placeOrder happy path (cart with items, etc.)
  await service.placeOrder('u1', dto);
  expect(emitter.emit).toHaveBeenCalledWith('order.placed', { orderId: expect.any(String), userId: 'u1' });
});

it('does NOT emit order.placed when placement fails/rolls back', async () => {
  // arrange a failing placement (e.g. empty cart → BadRequestException, or a $transaction throw)
  await expect(service.placeOrder('u1', dto)).rejects.toBeTruthy();
  expect(emitter.emit).not.toHaveBeenCalledWith('order.placed', expect.anything());
});

it('emits order.status.changed after a valid transition commits', async () => {
  // arrange updateStatus happy path (admin, PENDING→CONFIRMED or any valid move)
  await service.updateStatus(adminActor, 'o1', OrderStatus.CONFIRMED);
  expect(emitter.emit).toHaveBeenCalledWith('order.status.changed', { orderId: 'o1', userId: expect.any(String), status: OrderStatus.CONFIRMED });
});

it('does NOT emit order.status.changed on a rejected transition', async () => {
  // arrange an invalid transition → ConflictException
  await expect(service.updateStatus(adminActor, 'o1', OrderStatus.DELIVERED)).rejects.toBeTruthy();
  expect(emitter.emit).not.toHaveBeenCalledWith('order.status.changed', expect.anything());
});
```

Match the file's existing arrange helpers (it already tests `placeOrder`/`updateStatus`, so reuse those fixtures). The `emitter.emit` mock will also receive nothing for low-stock here since inventory is mocked — assert specifically on the `'order.placed'` / `'order.status.changed'` topic.

- [ ] **Step 3: Run to verify they fail**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/orders/orders.service.spec.ts -t "order.placed|order.status.changed"`
Expected: FAIL — emitter not injected / event not emitted.

- [ ] **Step 4: Implement in `orders.service.ts`.** Add `import { EventEmitter2 } from '@nestjs/event-emitter';` and `import { ORDER_PLACED, ORDER_STATUS_CHANGED_EVENT } from './orders-events';`. Add `private readonly events: EventEmitter2,` to the constructor (after `audit`). Two emit points:

`placeOrder` — the `$transaction` returns `{ order, lowStockCrossings }` into `order`; the low-stock emit loop already runs post-commit. Add the order.placed emit right after that loop, before `return this.toOrderView(order)`:

```ts
    for (const crossing of lowStockCrossings) {
      this.inventory.emitLowStock(crossing);
    }
    // Post-commit: the placement transaction has committed.
    this.events.emit(ORDER_PLACED, { orderId: order.id, userId: order.userId });

    return this.toOrderView(order);
```

`updateStatus` — there are TWO `$transaction` branches (stock-moving and not), each producing `updated` and returning `this.toOrderView(updated)`. Emit post-commit in BOTH branches, right before each `return this.toOrderView(updated)`:

```ts
      // (end of the movesStock branch, after the $transaction resolves)
      this.events.emit(ORDER_STATUS_CHANGED_EVENT, {
        orderId: updated.id,
        userId: updated.userId,
        status: nextStatus,
      });
      return this.toOrderView(updated);
```

```ts
    // (end of the non-stock branch)
    this.events.emit(ORDER_STATUS_CHANGED_EVENT, {
      orderId: updated.id,
      userId: updated.userId,
      status: nextStatus,
    });
    return this.toOrderView(updated);
```

(Both `updated` objects include `ORDER_INCLUDE` and carry `id` + `userId`. The emit is after the `await this.prisma.$transaction(...)` resolves in each branch — post-commit. A thrown transition/guard error earlier returns/throws before reaching either emit.)

- [ ] **Step 5: Run to verify producer tests pass**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/orders/orders.service.spec.ts`
Expected: PASS (existing order tests + new emit tests).

- [ ] **Step 6: Write the failing listener test** `order-notification.listener.spec.ts`:

```ts
import { OrderNotificationListener } from './order-notification.listener';
import { NotificationsService } from './notifications.service';
import { OrderStatus } from '@prisma/client';

describe('OrderNotificationListener', () => {
  it('records order-placed notifications on ORDER_PLACED', async () => {
    const notifications = { recordOrderPlaced: jest.fn().mockResolvedValue(undefined), recordOrderStatus: jest.fn() } as unknown as NotificationsService;
    const listener = new OrderNotificationListener(notifications);
    await listener.onPlaced({ orderId: 'o1', userId: 'u1' });
    expect(notifications.recordOrderPlaced).toHaveBeenCalledWith({ orderId: 'o1', userId: 'u1' });
  });
  it('records status notification on ORDER_STATUS_CHANGED', async () => {
    const notifications = { recordOrderPlaced: jest.fn(), recordOrderStatus: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;
    const listener = new OrderNotificationListener(notifications);
    await listener.onStatus({ orderId: 'o1', userId: 'u1', status: OrderStatus.SHIPPED });
    expect(notifications.recordOrderStatus).toHaveBeenCalledWith({ orderId: 'o1', userId: 'u1', status: OrderStatus.SHIPPED });
  });
  it('swallows and logs a failed write', async () => {
    const notifications = { recordOrderPlaced: jest.fn().mockRejectedValue(new Error('db')), recordOrderStatus: jest.fn() } as unknown as NotificationsService;
    const listener = new OrderNotificationListener(notifications);
    await expect(listener.onPlaced({ orderId: 'o1', userId: 'u1' })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 7: Implement the listener** `order-notification.listener.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ORDER_PLACED,
  ORDER_STATUS_CHANGED_EVENT,
} from '../orders/orders-events';
import type {
  OrderPlacedEvent,
  OrderStatusChangedEvent,
} from '../orders/orders-events';
import { NotificationsService } from './notifications.service';

/** Persists order notifications on order domain events (fire on events, not inline). */
@Injectable()
export class OrderNotificationListener {
  private readonly logger = new Logger(OrderNotificationListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(ORDER_PLACED)
  async onPlaced(event: OrderPlacedEvent): Promise<void> {
    try {
      await this.notifications.recordOrderPlaced(event);
    } catch (err) {
      this.logger.error(
        `Failed to record order-placed notification for order ${event.orderId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  @OnEvent(ORDER_STATUS_CHANGED_EVENT)
  async onStatus(event: OrderStatusChangedEvent): Promise<void> {
    try {
      await this.notifications.recordOrderStatus(event);
    } catch (err) {
      this.logger.error(
        `Failed to record order-status notification for order ${event.orderId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
```

- [ ] **Step 8: Register the listener** in `notifications.module.ts` — add `OrderNotificationListener` to `providers` (import it).

- [ ] **Step 9: Run orders + notifications specs, full suite, types**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/orders src/notifications && npx tsc --noEmit && npx jest`
Expected: PASS; tsc 0 new; full suite green (proves module DI resolves with the two new listeners).

- [ ] **Step 10: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/orders apps/api/src/notifications/order-notification.listener.ts apps/api/src/notifications/order-notification.listener.spec.ts apps/api/src/notifications/notifications.module.ts
git commit -m "feat(notifications): order.placed + order.status.changed emitters + order notification listener"
```

---

### Task 5: Drop the seller `payload.kind` NOTE + live smoke + final gate

**Files:**
- Modify: `apps/api/src/notifications/seller.listener.ts` (comment cleanup only)
- Create: `apps/api/scripts/smoke-notifications-emitters.sh`

**Interfaces:** none (cleanup + verification).

- [ ] **Step 1: Remove the stale NOTE.** In `seller.listener.ts`, delete the doc-comment paragraph that says seller events are stored under `REGISTRATION_CONFIRMATION` with a `payload.kind` discriminator (the workaround is gone as of Task 2). Leave the rest of the listener unchanged. Run `npx jest src/notifications/seller.listener.spec.ts` — still green (no behavior change; if the spec asserted the old `REGISTRATION_CONFIRMATION` type it was already updated in Task 2, so confirm the seller-listener spec doesn't re-assert the old type — if it does, update it to `SELLER_*`).

- [ ] **Step 2: Boot the API fresh** (avoid stale `:5000` per memory). `cd apps/api && npm run start:dev` (background). Confirm the app starts and the notification listeners register (no route change to look for; watch for "Nest application successfully started" + no DI errors).

- [ ] **Step 3: Write `smoke-notifications-emitters.sh`** (mirror `smoke-notifications.sh`), each scenario asserted via the S1 feed (`GET /notifications`) + `psql`:
  - **Register** a new user → `psql`: a `REGISTRATION_CONFIRMATION` row with that user's `userId`; and that user's `GET /notifications` shows it.
  - **Place an order** as that customer (add to cart → `POST /orders`) → a `NEW_ORDER` row (`userId:null`) **and** an `ORDER_CONFIRMATION` row for the customer; the customer feed shows the confirmation, an admin feed shows the NEW_ORDER.
  - **Admin transitions** the order: `PATCH /orders/:id/status` → `CONFIRMED` (assert NO new shipping/delivery notification), → `PROCESSING`, → `SHIPPED` (assert a `SHIPPING_UPDATE` for the customer), → `DELIVERED` (assert a `DELIVERY_UPDATE`). (Follow the state machine's legal path.)
  - **Seller:** register/approve a seller → assert a `SELLER_REGISTERED` / `SELLER_KYC_APPROVED`-typed row with **no `payload.kind`** key (`psql -tAc "SELECT payload ? 'kind' FROM ..."` → `f`).
  - Note/clean up rows created; document what was seeded.

- [ ] **Step 4: Run the smoke**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && bash scripts/smoke-notifications-emitters.sh`
Expected: all assertions pass; exit 0. Report honestly.

- [ ] **Step 5: Final gate** — full suite + types; stop the dev server.

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest && npx tsc --noEmit`
Expected: full suite green; 0 new tsc errors.

- [ ] **Step 6: Commit + STOP for verification** (RULE.md §1). Do NOT start S3.

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/notifications/seller.listener.ts apps/api/scripts/smoke-notifications-emitters.sh
git commit -m "test(notifications): emitters HTTP smoke vs ecom_dev + drop stale seller kind NOTE"
```

Then report: summary, files, and the RULE.md §6 resume prompt. After user verification, merge `feat/notifications-emitters` → `main` locally.

---

## Verification (whole slice)

- `npx jest` (full API suite) green, incl.: writer tests (registration/order-placed two-row/order-status Shipped+Delivered+no-op/seller SELLER_* no-kind), producer emit + no-emit-on-rollback tests (auth register, order place, order status), and both new listener tests.
- `npx tsc --noEmit`: 0 new errors (3 known pre-existing unchanged).
- Migration applied to `ecom_dev` via `migrate deploy` (no reset); three `SELLER_*` enum values present.
- `smoke-notifications-emitters.sh` green vs a fresh boot: registration → confirmation; order → NEW_ORDER + ORDER_CONFIRMATION; Shipped → SHIPPING_UPDATE; Delivered → DELIVERY_UPDATE; no notification on Confirmed/Processing; seller row is `SELLER_*`-typed with no `payload.kind`.
- Post-commit discipline: no emitter fires on a rolled-back/failed path (asserted per producer).
- Scope respected: no refund/channel/UI; no data backfill.
```
