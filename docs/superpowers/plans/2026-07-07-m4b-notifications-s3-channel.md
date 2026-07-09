# M4b — NotificationChannel Provider (mock) (S3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `NotificationChannel` provider seam (ADR-009) with a deterministic mock impl (ADR-010) that "delivers" each persisted notification via a channel (email/SMS → mock log line), dispatched inside the `NotificationsService.recordX` writers after persist — on branch `feat/notifications-channel`.

**Architecture:** Mirror the existing `ProductSearch` seam: a `NOTIFICATION_CHANNEL` injection token + `NotificationChannel` interface + `NotificationMessage` type in one file; a `MockNotificationChannel` impl that logs deterministically and never throws; `NotificationsService` injects the token and, after each `notification.create`, calls a private `dispatch(msg)` that awaits `channel.send` inside try/catch (swallow+log — persist is source of truth). Bind `{ provide: NOTIFICATION_CHANNEL, useClass: MockNotificationChannel }` in the module.

**Tech Stack:** NestJS 11 + TypeScript (strict), `@prisma/client` (`NotificationType` enum), Jest. No DB change, no new events, no UI.

## Global Constraints

- **Branch:** `feat/notifications-channel` (off `main` w/ M4a + M4b S1+S2; spec committed at `735908d`). Merge into `main` locally when done (user's workflow) — STOP for the verification gate first (RULE.md §1).
- **Persist is source of truth; channel is a best-effort side-effect.** `dispatch` awaits `channel.send` in a `try/catch` → `Logger.error`, NEVER rethrows. Adding dispatch after a persist must not change any `recordX`'s success/failure behavior.
- **`NotificationMessage = { type: NotificationType; userId: string | null; payload: unknown }`** — exactly what the writer just persisted. `NotificationChannel = { send(message: NotificationMessage): Promise<void> }`. Token: `export const NOTIFICATION_CHANNEL = Symbol('NOTIFICATION_CHANNEL')`.
- **Dispatch per persisted row:** two-row writers (`recordOrderPlaced` → NEW_ORDER + ORDER_CONFIRMATION; `recordLowStock` → admin + owning-seller-when-resolved) dispatch one message per row actually written. `recordOrderStatus` dispatches only when it persisted (Shipped/Delivered) — the `if (!type) return` no-op path dispatches nothing.
- **Mock only.** Ship the interface + mock; env-based adapter selection is a documented extension point, not implemented (matches `SearchModule`'s single-binding style).
- **Injecting the token adds a `NotificationsService` constructor param** → its spec (`new NotificationsService(prisma as never)`) must pass a `channel` mock; update every construction in `notifications.service.spec.ts`.
- Strict TS, no `any` in production code. Run from `apps/api` with absolute paths (cwd resets). `nest build` masks tsc errors → verify with `npx tsc --noEmit` (expect only the 3 known pre-existing M2/M3 spec errors, 0 new).

---

## File structure

```
apps/api/src/notifications/
  notification-channel.ts            CREATE  NOTIFICATION_CHANNEL token + NotificationChannel + NotificationMessage
  mock-notification-channel.ts       CREATE  MockNotificationChannel (deterministic log, never throws)
  mock-notification-channel.spec.ts  CREATE
  notifications.service.ts           MODIFY  inject @Inject(NOTIFICATION_CHANNEL); private dispatch(); call after each persist
  notifications.service.spec.ts      MODIFY  channel mock in ctor; send-after-persist + swallow-on-failure tests
  notifications.module.ts            MODIFY  providers += { provide: NOTIFICATION_CHANNEL, useClass: MockNotificationChannel }
```

**Task order:**
1. The seam: `notification-channel.ts` + `MockNotificationChannel` (+ mock spec) + module binding.
2. `NotificationsService` dispatch integration (inject + per-writer dispatch + tests).
3. Live smoke vs `ecom_dev` + final gate → STOP for verification.

---

### Task 1: The channel seam — token, interface, mock, module binding

**Files:**
- Create: `apps/api/src/notifications/notification-channel.ts`
- Create: `apps/api/src/notifications/mock-notification-channel.ts`, `apps/api/src/notifications/mock-notification-channel.spec.ts`
- Modify: `apps/api/src/notifications/notifications.module.ts`

**Interfaces:**
- Produces: `NOTIFICATION_CHANNEL` (Symbol token), `NotificationChannel` interface, `NotificationMessage` type, `MockNotificationChannel` class.

- [ ] **Step 1: Create `notification-channel.ts`:**

```ts
import { NotificationType } from '@prisma/client';

/** DI token for the swappable notification-delivery channel (ADR-009). */
export const NOTIFICATION_CHANNEL = Symbol('NOTIFICATION_CHANNEL');

/** The persisted-notification shape handed to a delivery channel.
 *  A real adapter maps type→template and resolves userId→email/phone at its edge. */
export interface NotificationMessage {
  type: NotificationType;
  userId: string | null; // null = staff/admin queue
  payload: unknown;
}

/** Out-of-band delivery of a persisted notification (email/SMS/…). ADR-009/010. */
export interface NotificationChannel {
  send(message: NotificationMessage): Promise<void>;
}
```

- [ ] **Step 2: Write the failing mock spec** `mock-notification-channel.spec.ts`:

```ts
import { Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { MockNotificationChannel } from './mock-notification-channel';

describe('MockNotificationChannel', () => {
  it('logs a user-targeted send and resolves', async () => {
    const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const channel = new MockNotificationChannel();
    await expect(
      channel.send({ type: NotificationType.ORDER_CONFIRMATION, userId: 'u1', payload: { orderId: 'o1' } }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith('would send ORDER_CONFIRMATION to user u1');
    spy.mockRestore();
  });

  it('logs a staff-queue send when userId is null', async () => {
    const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const channel = new MockNotificationChannel();
    await channel.send({ type: NotificationType.NEW_ORDER, userId: null, payload: {} });
    expect(spy).toHaveBeenCalledWith('would send NEW_ORDER to staff-queue');
    spy.mockRestore();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/notifications/mock-notification-channel.spec.ts`
Expected: FAIL — cannot find `./mock-notification-channel`.

- [ ] **Step 4: Create `mock-notification-channel.ts`:**

```ts
import { Injectable, Logger } from '@nestjs/common';
import type { NotificationChannel, NotificationMessage } from './notification-channel';

/** Deterministic in-memory NotificationChannel (ADR-010). Logs the intended
 *  delivery; makes no external call and never throws. A real adapter (SMTP/SMS)
 *  is an env-selected swap. */
@Injectable()
export class MockNotificationChannel implements NotificationChannel {
  private readonly logger = new Logger(MockNotificationChannel.name);

  async send(message: NotificationMessage): Promise<void> {
    const target = message.userId ? `user ${message.userId}` : 'staff-queue';
    this.logger.log(`would send ${message.type} to ${target}`);
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/notifications/mock-notification-channel.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Bind in the module.** In `notifications.module.ts`, import `NOTIFICATION_CHANNEL` from `./notification-channel` and `MockNotificationChannel` from `./mock-notification-channel`; add to the `providers` array: `{ provide: NOTIFICATION_CHANNEL, useClass: MockNotificationChannel }`. Keep the existing providers (`NotificationsService`, the listeners) + `exports` unchanged.

- [ ] **Step 7: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/notifications/notification-channel.ts apps/api/src/notifications/mock-notification-channel.ts apps/api/src/notifications/mock-notification-channel.spec.ts apps/api/src/notifications/notifications.module.ts
git commit -m "feat(notifications): NotificationChannel seam + MockNotificationChannel (ADR-009/010)"
```

---

### Task 2: Dispatch integration in `NotificationsService`

**Files:**
- Modify: `apps/api/src/notifications/notifications.service.ts`
- Modify: `apps/api/src/notifications/notifications.service.spec.ts`

**Interfaces:**
- Consumes: `NOTIFICATION_CHANNEL`, `NotificationChannel`, `NotificationMessage` (Task 1).
- Produces: a private `dispatch(message: NotificationMessage): Promise<void>` on `NotificationsService`; every `recordX` dispatches after persist.

**Current writer layout (verified):** `recordLowStock` (admin row always + seller row when `seller` resolves), `recordNewReview` (1 row), `recordSellerRegistered` (1), `recordSellerKyc` (1), `recordRegistration` (1), `recordOrderPlaced` (2: NEW_ORDER then ORDER_CONFIRMATION), `recordOrderStatus` (1, but early-returns before persist on non-Shipped/Delivered).

- [ ] **Step 1: Write the failing tests.** Extend `notifications.service.spec.ts`. First update the construction: the ctor becomes `(prisma, channel)` — pass a channel mock and capture it. Use a helper, e.g.:

```ts
function makeService() {
  const prisma = makePrisma(); // existing helper / inline mock
  const channel = { send: jest.fn().mockResolvedValue(undefined) };
  const service = new NotificationsService(prisma as never, channel as never);
  return { service, prisma, channel };
}
```

Update EVERY existing `new NotificationsService(...)` in the file to the 2-arg form (add the channel mock). Then add dispatch assertions:

```ts
it('recordRegistration dispatches after persist', async () => {
  const { service, channel } = makeService();
  await service.recordRegistration({ userId: 'u1' });
  expect(channel.send).toHaveBeenCalledWith({
    type: NotificationType.REGISTRATION_CONFIRMATION, userId: 'u1', payload: { userId: 'u1' },
  });
});

it('recordOrderPlaced dispatches BOTH rows', async () => {
  const { service, channel } = makeService();
  await service.recordOrderPlaced({ orderId: 'o1', userId: 'u1' });
  expect(channel.send).toHaveBeenCalledWith({ type: NotificationType.NEW_ORDER, userId: null, payload: { orderId: 'o1', userId: 'u1' } });
  expect(channel.send).toHaveBeenCalledWith({ type: NotificationType.ORDER_CONFIRMATION, userId: 'u1', payload: { orderId: 'o1' } });
  expect(channel.send).toHaveBeenCalledTimes(2);
});

it('recordOrderStatus SHIPPED dispatches once', async () => {
  const { service, channel } = makeService();
  await service.recordOrderStatus({ orderId: 'o1', userId: 'u1', status: OrderStatus.SHIPPED });
  expect(channel.send).toHaveBeenCalledWith({ type: NotificationType.SHIPPING_UPDATE, userId: 'u1', payload: { orderId: 'o1', status: OrderStatus.SHIPPED } });
  expect(channel.send).toHaveBeenCalledTimes(1);
});

it('recordOrderStatus no-op status dispatches nothing', async () => {
  const { service, channel } = makeService();
  await service.recordOrderStatus({ orderId: 'o1', userId: 'u1', status: OrderStatus.CONFIRMED });
  expect(channel.send).not.toHaveBeenCalled();
});

it('recordSellerRegistered dispatches SELLER_REGISTERED', async () => {
  const { service, channel } = makeService();
  await service.recordSellerRegistered({ sellerId: 's1', userId: 'u1', displayName: 'Shop' });
  expect(channel.send).toHaveBeenCalledWith({ type: NotificationType.SELLER_REGISTERED, userId: null, payload: { sellerId: 's1', userId: 'u1', displayName: 'Shop' } });
});

it('recordLowStock dispatches the admin row (and seller row when resolved)', async () => {
  const { service, prisma, channel } = makeService();
  prisma.seller.findUnique.mockResolvedValue({ userId: 'sellerU' });
  await service.recordLowStock({ productId: 'p1', available: 1, threshold: 5, sellerId: 's1' });
  expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({ type: NotificationType.LOW_STOCK, userId: null }));
  expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({ type: NotificationType.LOW_STOCK, userId: 'sellerU' }));
});

it('a failing channel.send is swallowed — persist still succeeds, no throw', async () => {
  const { service, prisma, channel } = makeService();
  channel.send.mockRejectedValue(new Error('smtp down'));
  await expect(service.recordRegistration({ userId: 'u1' })).resolves.toBeUndefined();
  expect(prisma.notification.create).toHaveBeenCalled(); // persisted despite send failure
});
```

(Match the file's existing mock/harness for `prisma`/`makePrisma`. Import `OrderStatus`, `NotificationType` from `@prisma/client`.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/notifications/notifications.service.spec.ts`
Expected: FAIL — ctor arity / `channel.send` not called.

- [ ] **Step 3: Implement.** In `notifications.service.ts`:
  - Imports: `import { Inject, Injectable, Logger } from '@nestjs/common';` (add `Inject`); `import { NOTIFICATION_CHANNEL } from './notification-channel'; import type { NotificationChannel, NotificationMessage } from './notification-channel';`.
  - Constructor: `constructor(private readonly prisma: PrismaService, @Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel) {}`.
  - Add the helper:

```ts
/** Best-effort out-of-band delivery of a persisted notification. Never throws:
 *  the persisted row is source of truth, so a channel outage must not fail the
 *  domain write or the originating request. */
private async dispatch(message: NotificationMessage): Promise<void> {
  try {
    await this.channel.send(message);
  } catch (err) {
    this.logger.error(
      `Notification channel send failed for ${message.type}`,
      err instanceof Error ? err.stack : String(err),
    );
  }
}
```

  - After each `await this.prisma.notification.create({ data: { type, userId, payload } })`, add `await this.dispatch({ type, userId, payload })` using the same values that row persisted. Specifically:
    - `recordLowStock`: after the admin create → `dispatch({ type: LOW_STOCK, userId: null, payload })`; inside the `if (seller)` block after the seller create → `dispatch({ type: LOW_STOCK, userId: seller.userId, payload })`.
    - `recordNewReview`: after its create → `dispatch({ type: NEW_REVIEW, userId: null, payload: {...the same payload...} })`.
    - `recordSellerRegistered`: → `dispatch({ type: SELLER_REGISTERED, userId: null, payload: {...} })`.
    - `recordSellerKyc`: → `dispatch({ type: <the same computed type>, userId: event.userId, payload: {...} })` (compute the type once into a local, use it for both `create` and `dispatch`).
    - `recordRegistration`: → `dispatch({ type: REGISTRATION_CONFIRMATION, userId: event.userId, payload: { userId: event.userId } })`.
    - `recordOrderPlaced`: after the NEW_ORDER create → `dispatch({ type: NEW_ORDER, userId: null, payload: { orderId, userId } })`; after the ORDER_CONFIRMATION create → `dispatch({ type: ORDER_CONFIRMATION, userId: event.userId, payload: { orderId } })`.
    - `recordOrderStatus`: after its single create (which is already guarded by `if (!type) return;`) → `dispatch({ type, userId: event.userId, payload: { orderId, status } })`. The early return means no dispatch on no-op statuses.

  To avoid drift between the persisted `data` and the dispatched message, prefer building a `const message: NotificationMessage = { type, userId, payload }` once, `create({ data: message })`, then `dispatch(message)` — the `Notification.create` data shape (`type`/`userId`/`payload`) is exactly `NotificationMessage`, so one object serves both. Apply this refactor per row where it reads cleanly; keep behavior identical.

- [ ] **Step 4: Run to verify they pass**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest src/notifications/notifications.service.spec.ts`
Expected: PASS (existing writer/read tests still green + new dispatch tests).

- [ ] **Step 5: Full suite + types** (proves DI resolves the new token everywhere the service is constructed)

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest && npx tsc --noEmit`
Expected: full suite green; tsc only the 3 known pre-existing errors (0 new).

- [ ] **Step 6: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/notifications/notifications.service.ts apps/api/src/notifications/notifications.service.spec.ts
git commit -m "feat(notifications): dispatch persisted notifications through NotificationChannel (swallow+log on failure)"
```

---

### Task 3: Live smoke vs `ecom_dev` + final gate

**Files:**
- Create: `apps/api/scripts/smoke-notification-channel.sh` (mirror `smoke-notifications-emitters.sh`).

**Interfaces:** none (verification only).

- [ ] **Step 1: Boot the API fresh** (avoid stale `:5000` per memory), capturing the server log to a file so the smoke can grep it. `cd apps/api && npm run start:dev > /tmp/api-s3.log 2>&1 &` (or the scratchpad log path). Confirm "Nest application successfully started" + no DI errors (a missing `NOTIFICATION_CHANNEL` binding would fail bootstrap here).

- [ ] **Step 2: Write `smoke-notification-channel.sh`** that triggers real flows and asserts BOTH the persisted row (via `psql`, already proven in S2) AND the mock-channel log line appears in the captured server log:
  - Register a fresh user (`POST /auth/register`) → grep the log for `would send REGISTRATION_CONFIRMATION to user <id>` (the id from the register response).
  - Place an order as that customer → grep for `would send NEW_ORDER to staff-queue` AND `would send ORDER_CONFIRMATION to user <id>`.
  - Confirm the HTTP responses were success (register 201, order 201) — i.e. dispatch did not block or break the request.
  - (Optional, if easy) transition the order to SHIPPED → grep for `would send SHIPPING_UPDATE to user <id>`.
  - Clean up any rows/entities created (delete RefreshToken before User, per the S2 smoke's lesson); document what was created.

- [ ] **Step 3: Run the smoke**

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && bash scripts/smoke-notification-channel.sh`
Expected: all assertions pass; exit 0. Report honestly which flows ran + what the log showed.

- [ ] **Step 4: Final gate** — full suite + types; stop the dev server.

Run: `cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat/apps/api && npx jest && npx tsc --noEmit`
Expected: full suite green; 0 new tsc errors.

- [ ] **Step 5: Commit + STOP for verification** (RULE.md §1). Do NOT start S4.

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/scripts/smoke-notification-channel.sh
git commit -m "test(notifications): channel-dispatch HTTP smoke vs ecom_dev"
```

Then report: summary, files, and the RULE.md §6 resume prompt. After user verification, merge `feat/notifications-channel` → `main` locally.

---

## Verification (whole slice)

- `npx jest` (full API suite) green, incl. mock-channel tests (user vs staff log line, never throws) and service dispatch tests (send-after-persist per writer, 2 sends for order-placed, 0 for no-op status, swallow-on-failure).
- `npx tsc --noEmit`: 0 new errors (3 known pre-existing unchanged).
- `smoke-notification-channel.sh` green vs a fresh boot: register + order flows produce the expected `would send …` log lines alongside the persisted rows, and the HTTP requests still succeed.
- No DB/schema change; no new events/UI; existing writer success/failure behavior unchanged (dispatch never throws).
- Env-swap remains a documented extension point (only the mock is bound).
```
