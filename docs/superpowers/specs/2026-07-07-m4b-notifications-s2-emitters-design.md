# M4b S2 — Notification Emitters + Enum Cleanup — Design

> **Date:** 2026-07-07
> **Phase:** M4b (of the M4 Reviews + Notifications group) — `docs/IMPLEMENTATION_PLAN.md`.
> **Branch:** `feat/notifications-emitters` (off `main`; S1 consumption API already merged).
> **Status:** Approved design. Implement one slice, stop-and-verify (RULE.md §1); TDD the emit/scoping logic (RULE.md §4); smoke-run the real thing vs `ecom_dev` (RULE.md §5).

## Context

M4b generalizes the event→notification pipeline. **S1 (merged)** built the *consumer* read/consume API. **S2 (this spec)** adds the missing *producers* — domain emitters whose sources exist on `main` today — plus their notification listeners, plus the `NotificationType` enum cleanup that removes the temporary `payload.kind` seller workaround.

**Emits today (unchanged):** `inventory.low-stock`, `seller.registered`, `seller.kyc.approved`, `seller.kyc.rejected`, `review.published`. All use the **deferred-emit-after-commit** pattern (ADR-003): collect during the transaction, emit after commit — proven by `inventory.service.ts` (`crossings`) and `reviews.service.ts`.

**Deferred to later slices (source not on `main` yet):** refund/return notifications (M6), payout (M6c), payment (M5b). S2 does **not** wire these.

## Decisions (approved)

1. **Scope = M0-available events + enum cleanup.** Wire only emitters whose source exists today: `auth.registered`, `order.placed`, `order.status.changed` (Shipped/Delivered). Plus the `SELLER_*` enum values + drop `payload.kind`. No refund/return/payout (deferred). No UI (S4), no channel provider (S3).
2. **Post-commit deferred emit** (ADR-003), mirroring `inventory.low-stock`: collect the event payload during the transaction, emit **after** it resolves. A rolled-back order never fires a spurious notification.
3. **Enum cleanup is forward-only.** Add `SELLER_REGISTERED`/`SELLER_KYC_APPROVED`/`SELLER_KYC_REJECTED` via additive migration; new rows use them; existing `REGISTRATION_CONFIRMATION`+`payload.kind` dev rows are left as-is (no backfill — safest on shared `ecom_dev`).
4. **Three explicit `SELLER_*` values** (not one generic `SELLER_UPDATE`) — the three events render differently in S4.
5. **`order.placed` writes two rows:** `NEW_ORDER` → staff queue (`userId:null`) **and** `ORDER_CONFIRMATION` → the customer (`userId`), mirroring how `recordLowStock` writes both an admin and a seller row.

## Events S2 produces

| Event constant | Emitted by (post-commit) | Payload | Notification(s) written by the listener |
|---|---|---|---|
| `auth.registered` | `AuthService.register` | `{ userId: string }` | `REGISTRATION_CONFIRMATION` → `userId` |
| `order.placed` | `OrdersService.placeOrder` | `{ orderId: string; userId: string }` | `NEW_ORDER` → `userId:null` (staff) **and** `ORDER_CONFIRMATION` → `userId` |
| `order.status.changed` | `OrdersService.updateStatus` | `{ orderId: string; userId: string; status: OrderStatus }` | `SHIPPED` → `SHIPPING_UPDATE` → `userId`; `DELIVERED` → `DELIVERY_UPDATE` → `userId`; any other status → **no notification** (S2) |

`NotificationType` values `REGISTRATION_CONFIRMATION`, `NEW_ORDER`, `ORDER_CONFIRMATION`, `SHIPPING_UPDATE`, `DELIVERY_UPDATE` **already exist** in the enum — the new emitters use them as-is.

## Architecture / boundaries (ADR-002/003)

Event constants + payload interfaces live with their **producing** domain; the `notifications` module owns the listeners + writers.

```
apps/api/src/
  auth/
    auth-events.ts                       CREATE  AUTH_REGISTERED + AuthRegisteredEvent
    auth.service.ts                      EXTEND  emit AUTH_REGISTERED post-commit in register()
    auth.module.ts                       (EventEmitterModule is global; no change unless emitter injection needs it)
  orders/
    orders-events.ts                     CREATE  ORDER_PLACED, ORDER_STATUS_CHANGED + payloads
    orders.service.ts                    EXTEND  emit both, post-commit (placeOrder + updateStatus)
  notifications/
    notifications.service.ts             EXTEND  + recordRegistration, recordOrderPlaced, recordOrderStatus; change recordSellerRegistered/recordSellerKyc to SELLER_* (drop kind)
    auth-notification.listener.ts        CREATE  @OnEvent(AUTH_REGISTERED)
    order-notification.listener.ts       CREATE  @OnEvent(ORDER_PLACED) + @OnEvent(ORDER_STATUS_CHANGED)
    seller.listener.ts                   EDIT    drop the payload.kind NOTE (behavior unchanged at listener level)
    notifications.module.ts              EXTEND  register the two new listeners
  prisma/
    schema.prisma                        MODIFY  NotificationType += SELLER_REGISTERED, SELLER_KYC_APPROVED, SELLER_KYC_REJECTED
    migrations/<ts>_seller_notification_types/migration.sql   CREATE  ALTER TYPE ADD VALUE ×3
```

**Emitter injection (verified).** Neither `AuthService` nor `OrdersService` injects `EventEmitter2` today — only `inventory.service.ts` does. **Both must add `EventEmitter2` to their constructor** (import `{ EventEmitter2 } from '@nestjs/event-emitter'`, add `private readonly events: EventEmitter2`), mirroring `inventory.service.ts:101`. `EventEmitterModule.forRoot()` is global, so no module import is needed — but adding a constructor param means their existing `*.service.spec.ts` unit tests (which construct the service directly) must pass an `EventEmitter2` mock (`{ emit: jest.fn() } as unknown as EventEmitter2`). Account for this in the test updates.

## Emit mechanism (post-commit — ADR-003)

- **`order.placed`:** `placeOrder` runs its writes in a `$transaction` and already returns after commit. Capture `{ orderId, userId }` from the committed order and `this.events.emit(ORDER_PLACED, …)` **after** the `$transaction(...)` call resolves — the exact shape of the existing low-stock `crossings` emit in this file. Never inside the callback.
- **`order.status.changed`:** `updateStatus` applies the transition (transactionally). Capture `{ orderId, userId, status }` for the **new** status and emit **after** commit. The listener filters to `SHIPPED`/`DELIVERED`.
- **`auth.registered`:** `register` creates the `User` (single write). Emit `{ userId }` after the create resolves. A failed registration (validation/duplicate email) throws before the emit → no notification.
- **Listeners:** `@OnEvent`, `async handle`, `try/catch` + `Logger.error`, **never rethrow** (a failed notification write must not break the originating request or surface to the user) — identical to `low-stock.listener.ts`.

## Service writers (signatures added to `NotificationsService`)

```ts
async recordRegistration(event: AuthRegisteredEvent): Promise<void>;   // REGISTRATION_CONFIRMATION → event.userId
async recordOrderPlaced(event: OrderPlacedEvent): Promise<void>;       // NEW_ORDER (userId:null) + ORDER_CONFIRMATION (event.userId)
async recordOrderStatus(event: OrderStatusChangedEvent): Promise<void>; // SHIPPED→SHIPPING_UPDATE / DELIVERED→DELIVERY_UPDATE → event.userId; else no-op
```

Enum-cleanup edits to existing writers:
- `recordSellerRegistered`: write `NotificationType.SELLER_REGISTERED`, `userId: null`, payload `{ sellerId, userId, displayName }` (no `kind`).
- `recordSellerKyc(event, kind)`: write `SELLER_KYC_APPROVED` or `SELLER_KYC_REJECTED` (derive the type from `kind`), `userId: event.userId`, payload `{ sellerId, userId, status, reason? }` (no `kind`). The `kind` parameter still selects the type; it is simply no longer stored in the payload.

Payloads carry IDs + scalars only (no PII beyond what S1 already exposes); the S1 feed is visibility-scoped so a customer only ever sees their own `ORDER_CONFIRMATION`/`SHIPPING_UPDATE`/`DELIVERY_UPDATE`/`REGISTRATION_CONFIRMATION`, and staff see the `NEW_ORDER`/seller queue.

## Migration (additive, forward-only)

Author by **file-diff** + apply with `npx prisma migrate deploy` — never `migrate reset` (shared `ecom_dev`). Postgres `ALTER TYPE … ADD VALUE` is non-transactional with other DDL; put the three `ADD VALUE`s in their own migration (no other statements), so `migrate deploy` applies cleanly:

```sql
ALTER TYPE "NotificationType" ADD VALUE 'SELLER_REGISTERED';
ALTER TYPE "NotificationType" ADD VALUE 'SELLER_KYC_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'SELLER_KYC_REJECTED';
```

No table/column change; no data backfill.

## Testing (TDD — API Jest)

**Producers (mirror the low-stock `no-emit-on-rollback` test):**
- `auth.service.spec.ts`: `register` emits `AUTH_REGISTERED` with `{ userId }` after a successful create; a failed/duplicate registration does NOT emit.
- `orders.service.spec.ts`: `placeOrder` emits `ORDER_PLACED` `{ orderId, userId }` post-commit; a rolled-back placement does NOT emit. `updateStatus` emits `ORDER_STATUS_CHANGED` `{ orderId, userId, status }` post-commit for a valid transition; a rejected transition does NOT emit.

**Consumers (new listeners, mock `NotificationsService`):**
- `auth-notification.listener.spec.ts`: on `AUTH_REGISTERED` → `recordRegistration(event)`; swallow + log on failure.
- `order-notification.listener.spec.ts`: on `ORDER_PLACED` → `recordOrderPlaced(event)`; on `ORDER_STATUS_CHANGED` → `recordOrderStatus(event)`; swallow + log.

**Writers (`notifications.service.spec.ts`, extend):**
- `recordRegistration` → one `REGISTRATION_CONFIRMATION` create, `userId = event.userId`.
- `recordOrderPlaced` → two creates: `NEW_ORDER` `userId:null` + `ORDER_CONFIRMATION` `userId = event.userId`.
- `recordOrderStatus` → `SHIPPED`→`SHIPPING_UPDATE`, `DELIVERED`→`DELIVERY_UPDATE` (`userId = event.userId`); any other status → no create.
- `recordSellerRegistered` → `SELLER_REGISTERED`, no `kind` in payload.
- `recordSellerKyc` → `SELLER_KYC_APPROVED`/`SELLER_KYC_REJECTED` per `kind`, no `kind` in payload.

## Verification gate (RULE.md §5)

1. `npx jest` (API) — all green incl. new specs; `npx tsc --noEmit` — 0 new errors (3 known pre-existing M2/M3 spec errors unchanged).
2. Migration applied to `ecom_dev` via `migrate deploy` (no reset); the three enum values present (`psql … \dT+ "NotificationType"`).
3. **Live HTTP smoke vs `ecom_dev`** (fresh boot; scripted like `smoke-notifications.sh`), each verified via the S1 feed (`GET /notifications`) + `psql`:
   - Register a new user → a `REGISTRATION_CONFIRMATION` row for that `userId`.
   - Place an order (as a customer) → a `NEW_ORDER` staff row (`userId:null`) **and** an `ORDER_CONFIRMATION` row for the customer.
   - Admin transitions the order `→ SHIPPED` then `→ DELIVERED` → a `SHIPPING_UPDATE` then a `DELIVERY_UPDATE` row for the customer; no notification on intermediate transitions (e.g. `CONFIRMED`).
   - Admin approves a seller (or register one) → a `SELLER_KYC_APPROVED` / `SELLER_REGISTERED`-typed row with **no `payload.kind`**.
   - Restore/annotate any rows created; note what was seeded.

## Out of scope (YAGNI — S2)

- Refund / return / payout / payment notifications — sources are M5/M6. Deferred.
- `NotificationChannel` (email/SMS mock) — S3.
- Feed/badge UI — S4.
- Backfilling existing `REGISTRATION_CONFIRMATION`+`kind` seller rows — forward-only.
- Notifications for order transitions other than Shipped/Delivered (e.g. Confirmed, Processing, Cancelled) — not in the PRD's customer-notification set for S2; can be added later if wanted.

## Risks

- **Emit-on-rollback** → post-commit deferred emit (ADR-003), covered by no-emit-on-rollback tests per producer.
- **Enum `ADD VALUE` in a transaction** → isolate the three `ADD VALUE`s in their own migration (no other DDL), applied via `migrate deploy`.
- **Duplicate/again-fired events** → each emitter fires once per successful action; listeners are idempotent-enough (each write is a new row; no dedup needed for S2's create-only writes).
- **Cross-user leak** → not introduced here; S1's visibility scoping governs reads, and each new row is written to the correct `userId`/`null` target (asserted in writer tests).
- **Listener failure breaking the request** → listeners swallow + log (never rethrow), matching low-stock.
