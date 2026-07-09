# M4b S3 — NotificationChannel Provider (mock) — Design

> **Date:** 2026-07-07
> **Phase:** M4b (of the M4 Reviews + Notifications group) — `docs/IMPLEMENTATION_PLAN.md`.
> **Branch:** `feat/notifications-channel` (off `main`; S1 consumption API + S2 emitters already merged).
> **Status:** Approved design. Implement one slice, stop-and-verify (RULE.md §1); TDD the dispatch/isolation logic (RULE.md §4); smoke-run the real thing vs `ecom_dev` (RULE.md §5).

## Context

M4b's notification pipeline currently: domain events (`auth.registered`, `order.placed`, `order.status.changed`, `inventory.low-stock`, seller/review events) → `@OnEvent` listeners → `NotificationsService.recordX` methods that **persist** a `Notification` row. S1 added the read/consume API; S2 added the emitters + enum cleanup. **S3 (this spec)** adds the out-of-band **delivery** seam: a `NotificationChannel` provider (ADR-009) with a deterministic **mock** implementation (ADR-010) that "sends" each persisted notification through a channel (email/SMS) — for the mock, a structured log line.

**Persistence stays the source of truth.** The channel is a best-effort side-effect layered on top; a channel failure must never fail the domain write or the originating request.

## Decisions (approved)

1. **Dispatch inside the writers, after persist.** Each `recordX` persists its `Notification` row(s) as today, then dispatches a channel message for each row. Listeners are unchanged; the seam stays internal to `NotificationsService`. (Not a second listener, not a persistence-wrapping refactor.)
2. **`NotificationChannel.send(message: NotificationMessage)`** where `NotificationMessage = { type: NotificationType; userId: string | null; payload: unknown }` — exactly the shape each writer already persists. Near-zero extra assembly; a real adapter maps `type`→template and resolves `userId`→email/phone at *its* edge (out of scope here).
3. **Mock ships as the default binding; env-swap is the documented extension point.** The module binds `{ provide: NOTIFICATION_CHANNEL, useClass: MockNotificationChannel }` — mirroring how `SearchModule` binds its one impl today. Selecting a real adapter via a `NOTIFICATION_CHANNEL` env is noted as the future hook (ADR-010), not implemented in S3.
4. **Failure isolation.** `channel.send` is awaited inside a `try/catch` → `Logger.error`; it never rethrows. The persisted row is authoritative. The mock never throws, but the guard makes the contract honest for a real adapter.
5. **No new events / notifications / UI / DB change.** S3 only adds the delivery seam over the existing writers. (Feed/badge UI is S4.)

## Architecture / boundaries

Mirrors the existing `ProductSearch` seam (`src/search/product-search.ts` = token + interface; `postgres-product-search.ts` = impl; `SearchModule` binds `{ provide, useClass }`; consumers `@Inject(TOKEN)`).

```
apps/api/src/notifications/
  notification-channel.ts             NEW  NOTIFICATION_CHANNEL token + NotificationChannel interface + NotificationMessage type
  notification-channel.spec.ts        (covered via mock spec below — no logic in the token file)
  mock-notification-channel.ts        NEW  MockNotificationChannel implements NotificationChannel (deterministic Logger line, never throws)
  mock-notification-channel.spec.ts   NEW
  notifications.service.ts            EDIT inject @Inject(NOTIFICATION_CHANNEL); add private dispatch(msg); call it after each persist
  notifications.service.spec.ts       EDIT construct with a channel mock; assert send-after-persist + swallow-on-failure
  notifications.module.ts             EDIT providers += { provide: NOTIFICATION_CHANNEL, useClass: MockNotificationChannel }
```

### The seam

```ts
// notification-channel.ts
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

```ts
// mock-notification-channel.ts
@Injectable()
export class MockNotificationChannel implements NotificationChannel {
  private readonly logger = new Logger(MockNotificationChannel.name);
  async send(message: NotificationMessage): Promise<void> {
    const target = message.userId ? `user ${message.userId}` : 'staff-queue';
    this.logger.log(`would send ${message.type} to ${target}`);
  }
}
```

### `NotificationsService` integration

Constructor gains `@Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel`. A private helper centralizes the isolation:

```ts
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

Each `recordX` calls `await this.dispatch({ type, userId, payload })` **after** its `notification.create(...)` resolves, using the same `type`/`userId`/`payload` it persisted. Writers that persist two rows dispatch two messages (one per row):
- `recordLowStock` → admin row (`userId:null`) + owning-seller row (when resolved) → dispatch each that was actually written.
- `recordOrderPlaced` → `NEW_ORDER` (`userId:null`) + `ORDER_CONFIRMATION` (customer) → dispatch both.
- `recordNewReview`, `recordRegistration`, `recordSellerRegistered`, `recordSellerKyc`, `recordOrderStatus` (the Shipped/Delivered rows) → dispatch the single row they wrote (`recordOrderStatus` dispatches only when it actually persisted — i.e. not on the no-op statuses).

`dispatch` never throws, so adding it after a persist cannot change any existing method's success/failure behavior.

## Env-swap (ADR-010)

S3 binds the mock as the sole `NOTIFICATION_CHANNEL` provider. A real adapter (e.g. `SmtpNotificationChannel`) is a future config+adapter task: add the class, and select via a `NOTIFICATION_CHANNEL=mock|smtp` env in the module's provider factory. Documented as the extension point; **not** implemented now (matching `SearchModule`'s single-binding style).

## Testing (TDD — API Jest)

**Mock (`mock-notification-channel.spec.ts`):**
- `send` for a user-targeted message logs `would send <TYPE> to user <id>` and resolves.
- `send` for a staff message (`userId: null`) logs `... to staff-queue` and resolves.
- `send` never throws.

**Service (`notifications.service.spec.ts`, extend — add a `channel` mock `{ send: jest.fn().mockResolvedValue(undefined) }` to the construction):**
- Each writer calls `channel.send` **after** persist with the `{ type, userId, payload }` it wrote:
  - `recordRegistration` → 1 send `{ REGISTRATION_CONFIRMATION, userId, … }`.
  - `recordOrderPlaced` → 2 sends (`NEW_ORDER` `userId:null` + `ORDER_CONFIRMATION` `userId`).
  - `recordOrderStatus` SHIPPED/DELIVERED → 1 send; **no-op statuses → 0 sends** (nothing persisted, nothing dispatched).
  - `recordNewReview` → 1 send `NEW_REVIEW` `userId:null`.
  - `recordSellerRegistered` → 1 send `SELLER_REGISTERED` `userId:null`; `recordSellerKyc` → 1 send `SELLER_KYC_*` `userId`.
  - `recordLowStock` → admin send always; seller send when the seller resolves.
- **Failure isolation:** when `channel.send` rejects, the writer still resolves (persist succeeded) and does not throw — assert the `notification.create` happened and the method resolved.

**No DB/schema change; no migration.**

## Verification gate (RULE.md §5)

1. `npx jest` (API) — all green incl. new specs; `npx tsc --noEmit` — 0 new errors (3 known pre-existing M2/M3 spec errors unchanged).
2. **Live smoke vs `ecom_dev`** (fresh boot, watch the server log): trigger real flows — register a user, place an order — and confirm the mock-channel log lines appear (e.g. `[MockNotificationChannel] would send REGISTRATION_CONFIRMATION to user <id>`, `... would send NEW_ORDER to staff-queue`, `... would send ORDER_CONFIRMATION to user <id>`) alongside the persisted rows (the S2 smoke already proves the rows; here we prove the dispatch fires after persist and nothing breaks). A scripted check greps the captured log for the expected lines. Confirm the request still succeeds (dispatch is non-blocking to the response).

## Out of scope (YAGNI — S3)

- Real email/SMS adapter (SMTP/Twilio/etc.) — future config+adapter task; only the interface + mock ship now.
- Per-type templates / rendering, recipient (email/phone) resolution — a real adapter's concern.
- Retries / delivery receipts / a `deliveredAt` column — not in S3; the mock is fire-and-log.
- Env-based provider selection wiring — documented extension point, not implemented.
- Feed/badge UI — S4.

## Risks

- **Channel failure breaking the domain write** → `dispatch` swallows + logs, never rethrows; the persisted row is source of truth. Covered by a swallow-on-failure test.
- **Double-dispatch / missing a row** on the two-row writers → dispatch is placed per persisted row; tests assert the exact send count per writer (2 for order-placed, 1/2 for low-stock, 0 for no-op status).
- **Log noise** → the mock uses `logger.log` (info); acceptable for a demo/mock. A real adapter would not log payloads.
- **Coupling the seam to Prisma types** → `NotificationMessage.payload` is `unknown` and `type` is the Prisma `NotificationType` enum (already the persisted contract); no new coupling introduced.
