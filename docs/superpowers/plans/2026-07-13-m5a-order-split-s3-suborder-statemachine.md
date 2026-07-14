# M5a S3 — SubOrder State Machine + Rollup + Seller API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the order state machine + stock side-effects onto `SubOrder`, make `Order.status` a computed rollup, add the seller (+admin-bypass) SubOrder fulfillment API, and narrow the Order-level status endpoint to customer self-cancel.

**Architecture:** A pure `rollupOrderStatus` collapses N SubOrder statuses into one `Order.status`. `OrdersService.transitionSubOrder` reuses the existing pure state machine on `SubOrderStatus`, moves stock per SubOrderItem (release/deduct/restock keyed on `subOrderId`), and recomputes `Order.status` in the SAME transaction. A `SellerSubOrdersController` exposes a cursor-paginated queue + a status PATCH, scoped by the M2 `buildSellerScope` (admins bypass = cross-seller). The old `PATCH /orders/:id/status` narrows to customer-self-cancel-all-suborders. Inventory `release`/`deduct`/`restock` gain an optional `subOrderId` (additive, mirroring S2's `reserve`).

**Tech Stack:** NestJS + Prisma 7 + PostgreSQL (`ecom_dev`), Jest. Reuses `orders/order-status.ts` (pure machine), `products/seller-scope.ts` (`buildSellerScope`/`ScopeActor`), `sellers/guards/seller-approved.guard.ts` + `auth/decorators/current-seller.ts`, the reviews cursor template, and the S1/S2 SubOrder schema + `subOrderId` movement column.

## Global Constraints

- **`Order.status` is a computed rollup** — never written directly by a transition. `rollupOrderStatus(statuses)` rule: all-`CANCELLED`→CANCELLED; all-`REFUNDED`→REFUNDED; otherwise the **least-advanced** status over the active set (excluding CANCELLED) on the rank ladder `PENDING(0)<CONFIRMED(1)<PROCESSING(2)<SHIPPED(3)<DELIVERED(4)<REFUNDED(5)`. Single active suborder → its status (legacy parity). Recomputed in the SAME `$transaction` as the SubOrder status write.
- **Reuse the pure state machine** `assertTransition(from,to)` from `order-status.ts` on `SubOrderStatus` (identical values; cast `as unknown as OrderStatusFlow` — the alias the file already imports as `OrderStatus as OrderStatusFlow`). Do NOT add a second state machine or edit `order-status.ts`.
- **Stock moves only through a SubOrder transition**, per SubOrderItem, passing BOTH `orderId` and `subOrderId`. Extend `release`/`deduct`/`restock` with an optional 5th `subOrderId?` param (mirror S2's `reserve`); `apply`'s `move` object already writes `subOrderId ?? null`.
- **Seller scoping (ADR-008):** `GET /seller/suborders` + `PATCH /seller/suborders/:id/status` scoped via `buildSellerScope(actor)`; a seller touching another's suborder → **404** (ownership `findFirst`, never 403 leak); ADMIN bypass (`SellerApprovedGuard` passes, `buildSellerScope`→`{}`) = cross-seller.
- **Events (post-commit):** always emit `SUBORDER_STATUS_CHANGED_EVENT {subOrderId, orderId, sellerId, status}`; emit the existing `ORDER_STATUS_CHANGED_EVENT {orderId, userId, status}` **only when the rollup changed `Order.status`**. No M4b change.
- **Audit:** `SUBORDER_STATUS_CHANGED` action with value **`'suborder.status-changed'`** (hyphen — deliberately distinct from the event string `'suborder.status.changed'`, avoiding the event↔audit collision pattern). `REFUND_ISSUED` (existing) on a REFUNDED suborder.
- **Order-level `PATCH /orders/:id/status`** narrows to **customer self-cancel** (all suborders PENDING → CANCELLED + rollup); `@Roles` drops to `CUSTOMER`; admin removed. Response shape (`toOrderView`) unchanged.
- **Cursor pagination** for the seller queue: `orderBy [{createdAt:'desc'},{id:'desc'}]`, `take: limit+1`, cursor `"<iso>_<id>"` (split on last `_`); backed by `@@index([sellerId,status,createdAt])`.
- **No migration** (schema on `main`). Admin order reads (`admin-orders`) stay OrderItem-based — untouched. UI is S4. `OrderItem` not dropped.
- **Strict TS, no `any`** in impl (test-mock `any` with the repo eslint-disable header is fine). 3 known pre-existing M2/M3 spec tsc errors — assert **0 new**.
- **Commands** (from `apps/api/`): `npm test -- <pattern>`, `npm test`, `npx tsc --noEmit`, `npm run lint`. Branch `feat/order-split-s3`. Push only; user lands the PR.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/orders/rollup-order-status.ts` (create) | Pure `rollupOrderStatus(statuses: SubOrderStatus[]): OrderStatus`. |
| `apps/api/src/orders/rollup-order-status.spec.ts` (create) | Unit tests. |
| `apps/api/src/inventory/inventory.service.ts` (modify) | `release`/`deduct`/`restock` (+ `applyStockForStatus`'s callee) gain optional `subOrderId`. |
| `apps/api/src/inventory/inventory.service.spec.ts` (modify) | Tests: each writes `subOrderId` when passed / null when omitted. |
| `apps/api/src/audit/audit-actions.ts` (modify) | Add `SUBORDER_STATUS_CHANGED = 'suborder.status-changed'`. |
| `apps/api/src/orders/orders-events.ts` (modify) | Add `SUBORDER_STATUS_CHANGED_EVENT` + `SubOrderStatusChangedEvent`. |
| `apps/api/src/orders/dto/list-suborders.dto.ts` (create) | `{ cursor?, limit?, status? }`. |
| `apps/api/src/orders/dto/update-suborder-status.dto.ts` (create) | `{ status: SubOrderStatus }`. |
| `apps/api/src/orders/orders.service.ts` (modify) | `SubOrderView`/`SubOrderItemView` types; `transitionSubOrder`; `listSellerSubOrders`; `applyStockForStatus` +subOrderId; rework `updateStatus`. |
| `apps/api/src/orders/orders.service.spec.ts` (modify) | Tests for transition, rollup wiring, list, reworked updateStatus. |
| `apps/api/src/orders/seller-suborders.controller.ts` (create) | `GET`/`PATCH /seller/suborders`. |
| `apps/api/src/orders/seller-suborders.controller.spec.ts` (create) | Controller tests. |
| `apps/api/src/orders/orders.module.ts` (modify) | Register `SellerSubOrdersController` + provide `SellerApprovedGuard`. |

Build order: rollup (T1) → inventory subOrderId (T2) → transition service + events/audit + SubOrderView (T3) → seller controller + list + module wiring (T4) → Order-level rework + full suite + live smoke (T5).

---

### Task 1: `rollupOrderStatus` pure function

**Files:**
- Create: `apps/api/src/orders/rollup-order-status.ts`
- Test: `apps/api/src/orders/rollup-order-status.spec.ts`

**Interfaces:**
- Consumes: `OrderStatus`, `SubOrderStatus` from `@prisma/client`.
- Produces: `rollupOrderStatus(statuses: SubOrderStatus[]): OrderStatus`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/orders/rollup-order-status.spec.ts`:

```ts
import { OrderStatus, SubOrderStatus } from '@prisma/client';
import { rollupOrderStatus } from './rollup-order-status';

const S = SubOrderStatus;
const O = OrderStatus;

describe('rollupOrderStatus', () => {
  it('single suborder rolls up to exactly that status (legacy parity)', () => {
    for (const s of Object.values(S)) {
      expect(rollupOrderStatus([s])).toBe(s as unknown as OrderStatus);
    }
  });

  it('all CANCELLED -> CANCELLED', () => {
    expect(rollupOrderStatus([S.CANCELLED, S.CANCELLED])).toBe(O.CANCELLED);
  });

  it('all REFUNDED -> REFUNDED', () => {
    expect(rollupOrderStatus([S.REFUNDED, S.REFUNDED])).toBe(O.REFUNDED);
  });

  it('least-advanced of the active set wins', () => {
    expect(rollupOrderStatus([S.PENDING, S.SHIPPED])).toBe(O.PENDING);
    expect(rollupOrderStatus([S.CONFIRMED, S.DELIVERED])).toBe(O.CONFIRMED);
    expect(rollupOrderStatus([S.PROCESSING, S.SHIPPED, S.DELIVERED])).toBe(O.PROCESSING);
  });

  it('excludes CANCELLED suborders from the active least-advanced calc', () => {
    expect(rollupOrderStatus([S.CANCELLED, S.PROCESSING])).toBe(O.PROCESSING);
    expect(rollupOrderStatus([S.CANCELLED, S.CANCELLED, S.DELIVERED])).toBe(O.DELIVERED);
  });

  it('ranks REFUNDED above DELIVERED (so a delivered+refunded mix rolls up to DELIVERED)', () => {
    expect(rollupOrderStatus([S.DELIVERED, S.REFUNDED])).toBe(O.DELIVERED);
  });

  it('all DELIVERED -> DELIVERED', () => {
    expect(rollupOrderStatus([S.DELIVERED, S.DELIVERED])).toBe(O.DELIVERED);
  });

  it('empty input -> CANCELLED (guard; no active suborders)', () => {
    expect(rollupOrderStatus([])).toBe(O.CANCELLED);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npm test -- rollup-order-status.spec.ts`
Expected: FAIL — cannot resolve `./rollup-order-status`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/orders/rollup-order-status.ts`:

```ts
import { OrderStatus, SubOrderStatus } from '@prisma/client';

/** Progress rank — REFUNDED sits above DELIVERED (Delivered -> Refunded). */
const RANK: Record<SubOrderStatus, number> = {
  [SubOrderStatus.PENDING]: 0,
  [SubOrderStatus.CONFIRMED]: 1,
  [SubOrderStatus.PROCESSING]: 2,
  [SubOrderStatus.SHIPPED]: 3,
  [SubOrderStatus.DELIVERED]: 4,
  [SubOrderStatus.REFUNDED]: 5,
  [SubOrderStatus.CANCELLED]: -1, // excluded from the active calc
};

/**
 * Collapse a SubOrder's statuses into the Order's rollup status.
 * - all CANCELLED -> CANCELLED; all REFUNDED -> REFUNDED
 * - otherwise the LEAST-advanced status over the active set (excluding CANCELLED)
 * SubOrderStatus and OrderStatus share identical values, so the return casts safely.
 */
export function rollupOrderStatus(statuses: SubOrderStatus[]): OrderStatus {
  if (statuses.length > 0 && statuses.every((s) => s === SubOrderStatus.CANCELLED)) {
    return OrderStatus.CANCELLED;
  }
  if (statuses.length > 0 && statuses.every((s) => s === SubOrderStatus.REFUNDED)) {
    return OrderStatus.REFUNDED;
  }
  const active = statuses.filter((s) => s !== SubOrderStatus.CANCELLED);
  if (active.length === 0) return OrderStatus.CANCELLED;
  const leastAdvanced = active.reduce((min, s) =>
    RANK[s] < RANK[min] ? s : min,
  );
  return leastAdvanced as unknown as OrderStatus;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npm test -- rollup-order-status.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/orders/rollup-order-status.ts apps/api/src/orders/rollup-order-status.spec.ts
git commit -m "feat(order-split): rollupOrderStatus pure Order.status rollup (S3)"
```

---

### Task 2: Extend `release`/`deduct`/`restock` with `subOrderId`

**Files:**
- Modify: `apps/api/src/inventory/inventory.service.ts` (`release` ~160, `deduct` ~191, `restock` ~219)
- Test: `apps/api/src/inventory/inventory.service.spec.ts`

**Interfaces:**
- Produces: `release`/`deduct`/`restock` each `(productId, quantity, orderId?, tx?, subOrderId?)` — the movement carries both `orderId` and `subOrderId`.

- [ ] **Step 1: Write the failing test**

Add a new `describe` to `apps/api/src/inventory/inventory.service.spec.ts` reusing the file's `build()` + `item()` helpers (as Task-3 of S2 did for `reserve`). Note `release`/`deduct` operate on a reserved balance, so seed `item({ reserved: 5 })`:

```ts
describe('InventoryService release/deduct/restock subOrderId', () => {
  it('release writes both orderId and subOrderId on the movement', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findFirst.mockResolvedValue(item({ reserved: 5 }));
    prisma.inventoryItem.update.mockResolvedValue(item({ reserved: 3 }));
    await svc.release('p1', 2, 'order1', undefined, 'sub1');
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderId: 'order1', subOrderId: 'sub1' }),
      }),
    );
  });

  it('deduct writes both orderId and subOrderId on the movement', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findFirst.mockResolvedValue(item({ reserved: 5 }));
    prisma.inventoryItem.update.mockResolvedValue(item({ reserved: 3 }));
    await svc.deduct('p1', 2, 'order1', undefined, 'sub1');
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderId: 'order1', subOrderId: 'sub1' }),
      }),
    );
  });

  it('restock writes both orderId and subOrderId on the movement', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findFirst.mockResolvedValue(item());
    prisma.inventoryItem.update.mockResolvedValue(item({ available: 12 }));
    await svc.restock('p1', 2, 'order1', undefined, 'sub1');
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderId: 'order1', subOrderId: 'sub1' }),
      }),
    );
  });

  it('omitting subOrderId writes subOrderId: null (existing callers unaffected)', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findFirst.mockResolvedValue(item({ reserved: 5 }));
    prisma.inventoryItem.update.mockResolvedValue(item({ reserved: 3 }));
    await svc.release('p1', 2, 'order1');
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderId: 'order1', subOrderId: null }),
      }),
    );
  });
});
```

*Note:* match the file's existing `build()`/`item()` and the exact `findFirst`/`update` mock methods (verified present). Adjust the seeded `reserved`/`available` if the file's `item()` defaults differ — the assertions on `subOrderId` are what matter.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npm test -- inventory.service.spec.ts`
Expected: FAIL — the new tests pass `subOrderId` but the movement `data` omits it (current signatures ignore a 5th arg).

- [ ] **Step 3: Write minimal implementation**

For each of `release`, `deduct`, `restock` in `inventory.service.ts`, append the optional param and forward it into the `apply` call's `move` object. Example for `release` (do the same for `deduct` and `restock`):

```ts
  async release(
    productId: string,
    quantity: number,
    orderId?: string,
    tx?: Prisma.TransactionClient,
    subOrderId?: string,
  ): Promise<void> {
    // ...existing requireItem + reserved-balance guard UNCHANGED...
    await this.apply(
      item.id,
      {
        counters: { /* existing counters UNCHANGED */ },
        type: MovementType.RELEASE,
        delta: /* existing */,
        orderId,
        subOrderId,
      },
      tx,
    );
  }
```

The `apply` `move` type already includes `subOrderId?` and writes `subOrderId: move.subOrderId ?? null` (added in S2 Task 3) — **no change to `apply` needed**; only thread `subOrderId` into each of the three `apply(...)` calls. Keep every other line of `release`/`deduct`/`restock` (guards, counters, delta, MovementType, reason) exactly as-is.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npm test -- inventory.service.spec.ts`
Expected: PASS — the 4 new tests + all existing inventory tests (existing callers pass no `subOrderId` → `null`, and the existing exact-object assertions already include `subOrderId: null` from S2's `apply` change).

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/inventory/inventory.service.ts apps/api/src/inventory/inventory.service.spec.ts
git commit -m "feat(order-split): release/deduct/restock accept subOrderId, write both refs (S3)"
```

---

### Task 3: `transitionSubOrder` service + SubOrderView + events + audit action

**Files:**
- Modify: `apps/api/src/audit/audit-actions.ts`
- Modify: `apps/api/src/orders/orders-events.ts`
- Modify: `apps/api/src/orders/orders.service.ts` (add types + `transitionSubOrder`; thread `subOrderId` into `applyStockForStatus`)
- Test: `apps/api/src/orders/orders.service.spec.ts`

**Interfaces:**
- Consumes: `rollupOrderStatus` (T1); `release`/`deduct`/`restock` (+subOrderId) (T2); `assertTransition`/`OrderStatusFlow` (existing); `buildSellerScope`/`ScopeActor` from `../products/seller-scope`.
- Produces:
  - `SUBORDER_STATUS_CHANGED = 'suborder.status-changed'` (audit).
  - `SUBORDER_STATUS_CHANGED_EVENT = 'suborder.status.changed'` + `SubOrderStatusChangedEvent { subOrderId, orderId, sellerId, status }`.
  - `interface SubOrderItemView { productId; productName; unitPrice; quantity; lineTotal; sellerName }`
  - `interface SubOrderView { id; orderId; status; subtotal; discountTotal; taxTotal; shippingTotal; grandTotal; shipFullName; shipLine1; shipLine2; shipCity; shipState; shipCountry; shipPostalCode; items: SubOrderItemView[]; createdAt }`
  - `transitionSubOrder(actor: { sub: string; role: Role; sellerId?: string }, subOrderId: string, nextStatus: SubOrderStatus): Promise<SubOrderView>`

- [ ] **Step 1: Add the audit action + event constants**

`apps/api/src/audit/audit-actions.ts` — append:
```ts
export const SUBORDER_STATUS_CHANGED = 'suborder.status-changed';
```

`apps/api/src/orders/orders-events.ts` — append (import `SubOrderStatus` from `@prisma/client` at the top):
```ts
/** Fired after a sub-order's status transition commits (post-commit). */
export const SUBORDER_STATUS_CHANGED_EVENT = 'suborder.status.changed';
export interface SubOrderStatusChangedEvent {
  subOrderId: string;
  orderId: string;
  sellerId: string;
  status: SubOrderStatus;
}
```

- [ ] **Step 2: Write the failing test**

Add to `apps/api/src/orders/orders.service.spec.ts` (extend `makePrisma` with `subOrder: { findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() }`; the `$transaction` mock already proxies to `prisma`). Import `SubOrderStatus`, `SUBORDER_STATUS_CHANGED_EVENT`, `ORDER_STATUS_CHANGED_EVENT`:

```ts
describe('OrdersService.transitionSubOrder', () => {
  const subOrder = (over: Record<string, unknown> = {}) => ({
    id: 'sub1',
    orderId: 'order1',
    sellerId: 's1',
    status: SubOrderStatus.PENDING,
    subtotal: '10', discountTotal: '0', taxTotal: '1', shippingTotal: '5', grandTotal: '16',
    shipFullName: 'Ada', shipLine1: '1 St', shipLine2: null,
    shipCity: 'London', shipState: 'LDN', shipCountry: 'UK', shipPostalCode: 'EC1',
    items: [{ productId: 'p1', productName: 'Mouse', unitPrice: '5', quantity: 2, lineTotal: '10', sellerName: 'Shop One' }],
    order: { id: 'order1', userId: 'u1' },
    ...over,
  });

  it('404s when the sub-order is not in the actor scope', async () => {
    const { svc, prisma } = build();
    prisma.subOrder.findFirst.mockResolvedValue(null);
    await expect(
      svc.transitionSubOrder({ sub: 'u1', role: Role.SELLER, sellerId: 's1' }, 'sub1', SubOrderStatus.CONFIRMED),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409s on an invalid transition', async () => {
    const { svc, prisma } = build();
    prisma.subOrder.findFirst.mockResolvedValue(subOrder({ status: SubOrderStatus.PENDING }));
    await expect(
      svc.transitionSubOrder({ sub: 'u1', role: Role.ADMIN }, 'sub1', SubOrderStatus.SHIPPED),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('SHIPPED deducts stock per item with subOrderId, updates the suborder, rolls up the order', async () => {
    const { svc, prisma, inventory } = build();
    // start at PROCESSING so PROCESSING->SHIPPED is valid
    prisma.subOrder.findFirst.mockResolvedValue(subOrder({ status: SubOrderStatus.PROCESSING }));
    prisma.subOrder.update.mockResolvedValue(subOrder({ status: SubOrderStatus.SHIPPED }));
    // sibling statuses after update: this one SHIPPED + another PENDING -> rollup PENDING
    prisma.subOrder.findMany.mockResolvedValue([
      { status: SubOrderStatus.SHIPPED }, { status: SubOrderStatus.PENDING },
    ]);
    prisma.order.findFirst = jest.fn(); // not used
    await svc.transitionSubOrder({ sub: 'admin', role: Role.ADMIN }, 'sub1', SubOrderStatus.SHIPPED);
    expect(inventory.deduct).toHaveBeenCalledWith('p1', 2, 'order1', prisma, 'sub1');
    expect(prisma.subOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sub1' }, data: { status: SubOrderStatus.SHIPPED } }),
    );
    // rollup writes Order.status = PENDING (least-advanced of [SHIPPED, PENDING])
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'order1' }, data: { status: OrderStatus.PENDING } }),
    );
  });

  it('emits suborder event always + order event only when rollup changes Order.status', async () => {
    const { svc, prisma, events } = build();
    prisma.subOrder.findFirst.mockResolvedValue(subOrder({ status: SubOrderStatus.PENDING, order: { id: 'order1', userId: 'u1' } }));
    prisma.subOrder.update.mockResolvedValue(subOrder({ status: SubOrderStatus.CONFIRMED }));
    // both siblings CONFIRMED -> order rolls to CONFIRMED (changed from PENDING)
    prisma.subOrder.findMany.mockResolvedValue([
      { status: SubOrderStatus.CONFIRMED }, { status: SubOrderStatus.CONFIRMED },
    ]);
    prisma.order.update = jest.fn().mockResolvedValue({});
    await svc.transitionSubOrder({ sub: 'admin', role: Role.ADMIN }, 'sub1', SubOrderStatus.CONFIRMED);
    const emitted = events.emit.mock.calls.map((c: any) => c[0]);
    expect(emitted).toContain(SUBORDER_STATUS_CHANGED_EVENT);
    expect(emitted).toContain(ORDER_STATUS_CHANGED_EVENT);
  });
});
```

(Add `NotFoundException`, `ConflictException`, `OrderStatus` imports to the spec if not already present.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api && npm test -- orders.service.spec.ts`
Expected: FAIL — `transitionSubOrder` not defined.

- [ ] **Step 4: Write minimal implementation**

In `orders.service.ts`:

(a) Add imports:
```ts
import { buildSellerScope, type ScopeActor } from '../products/seller-scope';
import { rollupOrderStatus } from './rollup-order-status';
import { SUBORDER_STATUS_CHANGED } from '../audit/audit-actions';
import {
  SUBORDER_STATUS_CHANGED_EVENT,
  // (ORDER_STATUS_CHANGED_EVENT / ORDER_PLACED already imported)
} from './orders-events';
```
(Also ensure `ORDER_STATUS_CHANGED` audit action + `REFUND_ISSUED` are imported — they already are.)

(b) Add the view types near the other view interfaces:
```ts
export interface SubOrderItemView {
  productId: string;
  productName: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  sellerName: string;
}
export interface SubOrderView {
  id: string;
  orderId: string;
  status: SubOrderStatus;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  shippingTotal: string;
  grandTotal: string;
  shipFullName: string;
  shipLine1: string;
  shipLine2: string | null;
  shipCity: string;
  shipState: string;
  shipCountry: string;
  shipPostalCode: string;
  items: SubOrderItemView[];
  createdAt: Date;
}
```

(c) Thread `subOrderId` into `applyStockForStatus`:
```ts
  private async applyStockForStatus(
    status: OrderStatus | SubOrderStatus,
    productId: string,
    quantity: number,
    orderId: string,
    tx: Prisma.TransactionClient,
    subOrderId?: string,
  ): Promise<void> {
    switch (status) {
      case OrderStatus.CANCELLED:
        await this.inventory.release(productId, quantity, orderId, tx, subOrderId);
        return;
      case OrderStatus.SHIPPED:
        await this.inventory.deduct(productId, quantity, orderId, tx, subOrderId);
        return;
      case OrderStatus.REFUNDED:
        await this.inventory.restock(productId, quantity, orderId, tx, subOrderId);
        return;
      default:
        return;
    }
  }
```
(`SubOrderStatus` values equal `OrderStatus` values, so the `case OrderStatus.X` labels match a `SubOrderStatus` argument at runtime; the union type keeps tsc happy. `movesStock` similarly accepts either — widen its param type to `OrderStatus | SubOrderStatus`.)

(d) Add `transitionSubOrder` + a `toSubOrderView` mapper:
```ts
  async transitionSubOrder(
    actor: { sub: string; role: Role; sellerId?: string },
    subOrderId: string,
    nextStatus: SubOrderStatus,
  ): Promise<SubOrderView> {
    const scope: ScopeActor = { role: actor.role, sellerId: actor.sellerId };
    const subOrder = await this.prisma.subOrder.findFirst({
      where: { id: subOrderId, ...buildSellerScope(scope) },
      include: { items: true, order: { select: { id: true, userId: true, status: true } } },
    });
    if (!subOrder) throw new NotFoundException('Sub-order not found');

    try {
      assertTransition(
        subOrder.status as unknown as OrderStatusFlow,
        nextStatus as unknown as OrderStatusFlow,
      );
    } catch (err) {
      if (err instanceof InvalidOrderTransitionError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }

    let orderStatusChanged = false;
    let newOrderStatus = subOrder.order.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (this.movesStock(nextStatus)) {
        for (const item of subOrder.items) {
          await this.applyStockForStatus(
            nextStatus, item.productId, item.quantity, subOrder.orderId, tx, subOrderId,
          );
        }
      }
      const u = await tx.subOrder.update({
        where: { id: subOrderId },
        data: { status: nextStatus },
        include: { items: true },
      });
      const siblings = await tx.subOrder.findMany({
        where: { orderId: subOrder.orderId },
        select: { status: true },
      });
      const rolled = rollupOrderStatus(siblings.map((s) => s.status));
      if (rolled !== subOrder.order.status) {
        await tx.order.update({ where: { id: subOrder.orderId }, data: { status: rolled } });
        orderStatusChanged = true;
        newOrderStatus = rolled;
      }
      await this.audit.record(
        {
          actorId: actor.sub,
          action: SUBORDER_STATUS_CHANGED,
          entityType: 'SubOrder',
          entityId: subOrderId,
          metadata: { from: subOrder.status, to: nextStatus, sellerId: subOrder.sellerId },
        },
        tx,
      );
      if (nextStatus === SubOrderStatus.REFUNDED) {
        await this.audit.record(
          {
            actorId: actor.sub,
            action: REFUND_ISSUED,
            entityType: 'SubOrder',
            entityId: subOrderId,
            metadata: { grandTotal: subOrder.grandTotal.toString() },
          },
          tx,
        );
      }
      return u;
    });

    this.events.emit(SUBORDER_STATUS_CHANGED_EVENT, {
      subOrderId,
      orderId: subOrder.orderId,
      sellerId: subOrder.sellerId,
      status: nextStatus,
    });
    if (orderStatusChanged) {
      this.events.emit(ORDER_STATUS_CHANGED_EVENT, {
        orderId: subOrder.orderId,
        userId: subOrder.order.userId,
        status: newOrderStatus,
      });
    }
    return this.toSubOrderView(updated);
  }

  protected toSubOrderView(
    s: Prisma.SubOrderGetPayload<{ include: { items: true } }>,
  ): SubOrderView {
    return {
      id: s.id,
      orderId: s.orderId,
      status: s.status,
      subtotal: money(s.subtotal),
      discountTotal: money(s.discountTotal),
      taxTotal: money(s.taxTotal),
      shippingTotal: money(s.shippingTotal),
      grandTotal: money(s.grandTotal),
      shipFullName: s.shipFullName,
      shipLine1: s.shipLine1,
      shipLine2: s.shipLine2,
      shipCity: s.shipCity,
      shipState: s.shipState,
      shipCountry: s.shipCountry,
      shipPostalCode: s.shipPostalCode,
      items: s.items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        unitPrice: money(i.unitPrice),
        quantity: i.quantity,
        lineTotal: money(i.lineTotal),
        sellerName: i.sellerName,
      })),
      createdAt: s.createdAt,
    };
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npm test -- orders.service.spec.ts`
Expected: PASS (the 4 transition tests + all existing orders tests).

Run: `npx tsc --noEmit`
Expected: 0 new errors (3 known pre-existing).

- [ ] **Step 6: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/audit/audit-actions.ts apps/api/src/orders/orders-events.ts apps/api/src/orders/orders.service.ts apps/api/src/orders/orders.service.spec.ts
git commit -m "feat(order-split): transitionSubOrder (state machine + stock + rollup + events) (S3)"
```

---

### Task 4: Seller SubOrder API (queue list + status PATCH) + module wiring

**Files:**
- Create: `apps/api/src/orders/dto/list-suborders.dto.ts`
- Create: `apps/api/src/orders/dto/update-suborder-status.dto.ts`
- Modify: `apps/api/src/orders/orders.service.ts` (add `listSellerSubOrders` + cursor decode)
- Create: `apps/api/src/orders/seller-suborders.controller.ts`
- Create: `apps/api/src/orders/seller-suborders.controller.spec.ts`
- Modify: `apps/api/src/orders/orders.module.ts`
- Test: `apps/api/src/orders/orders.service.spec.ts` (list tests)

**Interfaces:**
- Consumes: `transitionSubOrder`, `SubOrderView` (T3); `buildSellerScope`/`ScopeActor`; `SellerApprovedGuard`; `@CurrentSeller`/`@CurrentUser`.
- Produces: `listSellerSubOrders(actor: ScopeActor, dto: ListSubOrdersDto): Promise<{ data: SubOrderView[]; nextCursor: string | null }>`; `SellerSubOrdersController`.

- [ ] **Step 1: Write the DTOs**

`apps/api/src/orders/dto/list-suborders.dto.ts`:
```ts
import { IsInt, IsOptional, IsString, MaxLength, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { SubOrderStatus } from '@prisma/client';

export class ListSubOrdersDto {
  @IsOptional() @IsString() @MaxLength(200)
  cursor?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;

  @IsOptional() @IsEnum(SubOrderStatus)
  status?: SubOrderStatus;
}
```

`apps/api/src/orders/dto/update-suborder-status.dto.ts`:
```ts
import { IsEnum } from 'class-validator';
import { SubOrderStatus } from '@prisma/client';

export class UpdateSubOrderStatusDto {
  @IsEnum(SubOrderStatus)
  status!: SubOrderStatus;
}
```

- [ ] **Step 2: Write the failing service + controller tests**

Add to `orders.service.spec.ts`:
```ts
describe('OrdersService.listSellerSubOrders', () => {
  it('scopes to the seller and cursor-paginates createdAt DESC, id DESC', async () => {
    const { svc, prisma } = build();
    const rows = [
      { ...subOrderRow('a'), createdAt: new Date('2026-07-03T00:00:00Z') },
      { ...subOrderRow('b'), createdAt: new Date('2026-07-02T00:00:00Z') },
    ];
    prisma.subOrder.findMany.mockResolvedValue(rows);
    const res = await svc.listSellerSubOrders({ role: Role.SELLER, sellerId: 's1' }, { limit: 20 });
    const arg = prisma.subOrder.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ sellerId: 's1' });
    expect(arg.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(arg.take).toBe(21);
    expect(res.data).toHaveLength(2);
    expect(res.nextCursor).toBeNull();
  });

  it('sets nextCursor and trims when more than limit rows return', async () => {
    const { svc, prisma } = build();
    const rows = Array.from({ length: 3 }, (_, i) => ({
      ...subOrderRow(`x${i}`), createdAt: new Date(`2026-07-0${3 - i}T00:00:00Z`),
    }));
    prisma.subOrder.findMany.mockResolvedValue(rows);
    const res = await svc.listSellerSubOrders({ role: Role.SELLER, sellerId: 's1' }, { limit: 2 });
    expect(res.data).toHaveLength(2);
    expect(res.nextCursor).toMatch(/_x1$/); // last kept row id
  });

  it('admin scope is unscoped (no sellerId in where)', async () => {
    const { svc, prisma } = build();
    prisma.subOrder.findMany.mockResolvedValue([]);
    await svc.listSellerSubOrders({ role: Role.ADMIN }, {});
    const arg = prisma.subOrder.findMany.mock.calls[0][0];
    expect(arg.where.sellerId).toBeUndefined();
  });
});
```
Add a `subOrderRow(id)` helper near the other spec fixtures (id + orderId + sellerId 's1' + status + the 5 money strings + 7 ship fields + `items: [...]` with sellerName + `createdAt`). Create `seller-suborders.controller.spec.ts`:
```ts
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Role, SubOrderStatus } from '@prisma/client';
import { SellerSubOrdersController } from './seller-suborders.controller';

const makeService = () => ({
  listSellerSubOrders: jest.fn().mockResolvedValue({ data: [], nextCursor: null }),
  transitionSubOrder: jest.fn().mockResolvedValue({ id: 'sub1' }),
});

describe('SellerSubOrdersController', () => {
  const seller = { sub: 'u1', email: 's@b.c', role: Role.SELLER };
  const admin = { sub: 'a1', email: 'a@b.c', role: Role.ADMIN };

  it('list delegates with a SELLER scope actor (from req.sellerId) + query', async () => {
    const svc = makeService();
    const ctrl = new SellerSubOrdersController(svc as never);
    await ctrl.list(seller as never, { sellerId: 'seller-1' }, { limit: 10 });
    expect(svc.listSellerSubOrders).toHaveBeenCalledWith(
      { role: Role.SELLER, sellerId: 'seller-1' }, { limit: 10 },
    );
  });

  it('list for an ADMIN (no req.sellerId) delegates an unscoped ADMIN actor', async () => {
    const svc = makeService();
    const ctrl = new SellerSubOrdersController(svc as never);
    await ctrl.list(admin as never, {}, {});
    expect(svc.listSellerSubOrders).toHaveBeenCalledWith({ role: Role.ADMIN }, {});
  });

  it('updateStatus delegates with {sub, role, sellerId} for a seller', async () => {
    const svc = makeService();
    const ctrl = new SellerSubOrdersController(svc as never);
    await ctrl.updateStatus(seller as never, { sellerId: 'seller-1' }, 'sub1', {
      status: SubOrderStatus.CONFIRMED,
    });
    expect(svc.transitionSubOrder).toHaveBeenCalledWith(
      { sub: 'u1', role: Role.SELLER, sellerId: 'seller-1' }, 'sub1', SubOrderStatus.CONFIRMED,
    );
  });

  it('updateStatus for an ADMIN passes role ADMIN + undefined sellerId', async () => {
    const svc = makeService();
    const ctrl = new SellerSubOrdersController(svc as never);
    await ctrl.updateStatus(admin as never, {}, 'sub1', { status: SubOrderStatus.SHIPPED });
    expect(svc.transitionSubOrder).toHaveBeenCalledWith(
      { sub: 'a1', role: Role.ADMIN, sellerId: undefined }, 'sub1', SubOrderStatus.SHIPPED,
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/api && npm test -- orders.service.spec.ts seller-suborders.controller.spec.ts`
Expected: FAIL — `listSellerSubOrders` / `SellerSubOrdersController` not defined.

- [ ] **Step 4: Implement `listSellerSubOrders` + cursor decode + the controller + module wiring**

In `orders.service.ts` add:
```ts
  async listSellerSubOrders(
    actor: ScopeActor,
    dto: ListSubOrdersDto,
  ): Promise<{ data: SubOrderView[]; nextCursor: string | null }> {
    const limit = dto.limit ?? 20;
    const where: Prisma.SubOrderWhereInput = {
      ...buildSellerScope(actor),
      ...(dto.status ? { status: dto.status } : {}),
    };
    const cursorFilter = this.decodeSubOrderCursor(dto.cursor);
    const rows = await this.prisma.subOrder.findMany({
      where: cursorFilter ? { AND: [where, cursorFilter] } : where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { items: true },
    });
    let nextCursor: string | null = null;
    if (rows.length > limit) {
      const last = rows[limit - 1];
      nextCursor = `${last.createdAt.toISOString()}_${last.id}`;
      rows.length = limit;
    }
    return { data: rows.map((r) => this.toSubOrderView(r)), nextCursor };
  }

  private decodeSubOrderCursor(cursor?: string): Prisma.SubOrderWhereInput | null {
    if (!cursor) return null;
    const idx = cursor.lastIndexOf('_');
    if (idx < 0) return null;
    const createdAt = new Date(cursor.slice(0, idx));
    if (Number.isNaN(createdAt.getTime())) return null;
    const id = cursor.slice(idx + 1);
    return {
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
    };
  }
```
Add the `ListSubOrdersDto` import to `orders.service.ts`.

**Design note (verified):** the global `RolesGuard` does `required.includes(user.role)`, so `@Roles(Role.SELLER)` alone would 403 an admin before the handler. To allow the admin cross-seller path, the class uses **`@Roles(Role.SELLER, Role.ADMIN)`** + `@UseGuards(SellerApprovedGuard)` (whose ADMIN bypass returns `true` and attaches NO `request.sellerId`). Because `@CurrentSeller` *throws* when `sellerId` is absent, the controller must NOT use `@CurrentSeller` — it reads the (optional) seller id from the request via `@Req()` and branches on `user.role` to build the `ScopeActor` (ADMIN → `{ role: ADMIN }` → `buildSellerScope` returns `{}` = cross-seller; SELLER → `{ role: SELLER, sellerId }`).

Create `apps/api/src/orders/seller-suborders.controller.ts`:
```ts
import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { ListSubOrdersDto } from './dto/list-suborders.dto';
import { UpdateSubOrderStatusDto } from './dto/update-suborder-status.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { SellerApprovedGuard } from '../sellers/guards/seller-approved.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth-tokens';
import { ScopeActor } from '../products/seller-scope';

/**
 * Seller fulfillment queue + per-SubOrder transitions. A SELLER is scoped to
 * their own sub-orders (cross-tenant access 404s via the service scope). ADMIN
 * passes SellerApprovedGuard's bypass (no sellerId attached) and buildSellerScope
 * returns {} → cross-seller. RolesGuard admits both roles.
 */
@Roles(Role.SELLER, Role.ADMIN)
@UseGuards(SellerApprovedGuard)
@Controller('seller/suborders')
export class SellerSubOrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Build the ownership scope: ADMIN unscoped, SELLER scoped to req.sellerId
   *  (attached by SellerApprovedGuard for an ACTIVE seller). */
  private scopeFor(user: AccessTokenPayload, sellerId?: string): ScopeActor {
    return user.role === Role.ADMIN
      ? { role: Role.ADMIN }
      : { role: Role.SELLER, sellerId: sellerId! };
  }

  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: { sellerId?: string },
    @Query() query: ListSubOrdersDto,
  ) {
    return this.orders.listSellerSubOrders(this.scopeFor(user, req.sellerId), query);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: { sellerId?: string },
    @Param('id') id: string,
    @Body() dto: UpdateSubOrderStatusDto,
  ) {
    return this.orders.transitionSubOrder(
      { sub: user.sub, role: user.role, sellerId: req.sellerId },
      id,
      dto.status,
    );
  }
}
```

The controller spec (Step 2) passes a fake `req`: `{ sellerId: 'seller-1' }` for the SELLER case → asserts the delegated scope actor is `{ role: SELLER, sellerId: 'seller-1' }`; `{}` (no sellerId) with an ADMIN user → asserts `{ role: ADMIN }` (and for `transitionSubOrder`, `{ sub, role: ADMIN, sellerId: undefined }` — `buildSellerScope` ignores sellerId for admin).

Wire the module — `apps/api/src/orders/orders.module.ts`:
```ts
import { SellerSubOrdersController } from './seller-suborders.controller';
import { SellerApprovedGuard } from '../sellers/guards/seller-approved.guard';
// ...
@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [OrdersController, AdminOrdersController, SellerSubOrdersController],
  providers: [OrdersService, SellerApprovedGuard],
  exports: [OrdersService],
})
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npm test -- orders.service.spec.ts seller-suborders.controller.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/orders/dto/list-suborders.dto.ts apps/api/src/orders/dto/update-suborder-status.dto.ts apps/api/src/orders/seller-suborders.controller.ts apps/api/src/orders/seller-suborders.controller.spec.ts apps/api/src/orders/orders.service.ts apps/api/src/orders/orders.service.spec.ts apps/api/src/orders/orders.module.ts
git commit -m "feat(order-split): seller SubOrder API — queue list + status PATCH (S3)"
```

---

### Task 5: Rework Order-level `updateStatus` (customer self-cancel) + full suite + live smoke

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts` (`updateStatus`)
- Modify: `apps/api/src/orders/orders.controller.ts` (`@Roles` on the status route)
- Test: `apps/api/src/orders/orders.service.spec.ts`

**Interfaces:**
- Consumes: `rollupOrderStatus`, `transitionSubOrder` internals / the same per-suborder cancel logic; `SubOrderStatus`.

- [ ] **Step 1: Update the failing tests for the reworked behavior**

In `orders.service.spec.ts`, update the existing `updateStatus` tests + add:
- customer self-cancel of an all-PENDING order cancels every SubOrder (release stock per suborder-item with subOrderId) + Order → CANCELLED;
- a partially-progressed order (some suborder not PENDING) → `ConflictException` (or Forbidden per the guard) on self-cancel;
- foreign order → `NotFoundException`;
- admin calling the Order-level PATCH is no longer permitted (route now `@Roles(CUSTOMER)`), so the service either rejects a non-customer or the controller gate does — assert the service path used by the customer works; the admin-removal is enforced at the controller `@Roles`.
- `toOrderView` response shape unchanged.

Extend `makePrisma` if needed so `order.findUnique` returns an order including `subOrders: [{ id, status, items:[...] }]` (add `subOrders` to the order fixture + the `ORDER_INCLUDE`-equivalent used by updateStatus). The exact test bodies mirror the existing updateStatus tests but assert per-suborder cancellation.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npm test -- orders.service.spec.ts`
Expected: FAIL — current `updateStatus` still does Order-level stock + status write.

- [ ] **Step 3: Rework `updateStatus`**

Replace the current `updateStatus(actor, orderId, nextStatus)` body. Load the order with its sub-orders (+ items), enforce customer ownership, allow ONLY a full self-cancel (every sub-order `PENDING`, `nextStatus === CANCELLED`), cancel each sub-order (releasing stock with `subOrderId`), roll up to CANCELLED, audit + emit. Full body:

```ts
  async updateStatus(
    actor: AccessTokenPayload,
    orderId: string,
    nextStatus: OrderStatus,
  ): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { subOrders: { include: { items: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    // Customers may only act on their own order; hide others as 404.
    if (order.userId !== actor.sub) {
      throw new NotFoundException('Order not found');
    }
    // The only self-service transition is cancelling a fully-pending order.
    if (nextStatus !== OrderStatus.CANCELLED) {
      throw new ForbiddenException(
        'You can only cancel an order while it is pending',
      );
    }
    const allPending = order.subOrders.every(
      (s) => s.status === SubOrderStatus.PENDING,
    );
    if (order.subOrders.length === 0 || !allPending) {
      throw new ConflictException(
        'This order can no longer be cancelled; one or more sellers have started fulfilment',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const sub of order.subOrders) {
        for (const item of sub.items) {
          await this.applyStockForStatus(
            SubOrderStatus.CANCELLED,
            item.productId,
            item.quantity,
            order.id,
            tx,
            sub.id,
          );
        }
        await tx.subOrder.update({
          where: { id: sub.id },
          data: { status: SubOrderStatus.CANCELLED },
        });
        await this.audit.record(
          {
            actorId: actor.sub,
            action: SUBORDER_STATUS_CHANGED,
            entityType: 'SubOrder',
            entityId: sub.id,
            metadata: {
              from: sub.status,
              to: SubOrderStatus.CANCELLED,
              sellerId: sub.sellerId,
            },
          },
          tx,
        );
      }
      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CANCELLED },
      });
      await this.audit.record(
        {
          actorId: actor.sub,
          action: ORDER_STATUS_CHANGED,
          entityType: 'Order',
          entityId: order.id,
          metadata: { from: order.status, to: OrderStatus.CANCELLED },
        },
        tx,
      );
    });

    // Post-commit: one suborder event each, plus the order-level rollup event.
    for (const sub of order.subOrders) {
      this.events.emit(SUBORDER_STATUS_CHANGED_EVENT, {
        subOrderId: sub.id,
        orderId: order.id,
        sellerId: sub.sellerId,
        status: SubOrderStatus.CANCELLED,
      });
    }
    this.events.emit(ORDER_STATUS_CHANGED_EVENT, {
      orderId: order.id,
      userId: order.userId,
      status: OrderStatus.CANCELLED,
    });

    // Re-load with the OrderItem include for the unchanged response shape.
    const view = await this.prisma.order.findUnique({
      where: { id: order.id },
      include: ORDER_INCLUDE,
    });
    return this.toOrderView(view!);
  }
```

Notes: this removes the old per-`OrderItem` `applyStockForStatus` loop and the admin-arbitrary-transition branch entirely (admins now transition per sub-order via the seller endpoint). `rollupOrderStatus` isn't called here because a full cancel is unconditionally CANCELLED (all sub-orders CANCELLED) — writing `OrderStatus.CANCELLED` directly is the same value the rollup would produce; keep it explicit and simple. `applyStockForStatus`/`movesStock` param types were widened to `OrderStatus | SubOrderStatus` in Task 3(c), so passing `SubOrderStatus.CANCELLED` type-checks. The final re-load uses `ORDER_INCLUDE` (OrderItem) so `toOrderView` returns the identical response shape.

Update `orders.controller.ts`: the `@Patch(':id/status')` route decorator drops `@Roles(Role.ADMIN, Role.CUSTOMER)` → `@Roles(Role.CUSTOMER)`. (Its call becomes `this.orders.updateStatus(user, id, dto.status)` — unchanged signature; the service now enforces the narrowed rules.)

- [ ] **Step 4: Run the orders spec + confirm green**

Run: `cd apps/api && npm test -- orders.service.spec.ts`
Expected: PASS (reworked + new tests).

- [ ] **Step 5: Full suite + typecheck + lint**

Run: `cd apps/api && npm test`
Expected: full suite green.

Run: `npx tsc --noEmit`
Expected: 0 new (3 known pre-existing).

Run: `npm run lint`
Expected: changed files clean. If `--fix` reformats UNRELATED files, do NOT stage them — `git add` only the S3 files; `git checkout --` any stray.

- [ ] **Step 6: LIVE smoke vs `ecom_dev`**

Kill any stale :5000 (`lsof -nP -iTCP:5000 -sTCP:LISTEN` → kill), boot fresh (`npm run start:dev`), confirm the new routes map (`Mapped {/seller/suborders, GET}`, `{/seller/suborders/:id/status, PATCH}`).
- Place a **2-seller** order → 1 Order (PENDING) + 2 SubOrders (PENDING).
- As **seller A** (`seller@example.com`): `GET /seller/suborders` shows only A's; `PATCH .../status` drive `PENDING→CONFIRMED→PROCESSING→SHIPPED`; verify a DEDUCTION movement with `subOrderId` on SHIPPED; `Order.status` rolls up (least-advanced with B still PENDING).
- Seller A → B's suborder = **404**; invalid transition = **409**.
- As **admin**: `GET /seller/suborders` cross-seller; transition B's suborder.
- Drive both to DELIVERED → Order DELIVERED. Refund one → RESTOCK movement, Order rolls up.
- **Customer self-cancel:** fresh all-PENDING order → `PATCH /orders/:id/status {CANCELLED}` cancels both suborders (RELEASE movements) + Order CANCELLED; a partially-shipped order → self-cancel **rejected**.
- Confirm M4b: customer notification fires when the Order rolls to SHIPPED (order-level event once).
- `GET /orders/:id` shape unchanged. **Clean up all test data**; confirm `ecom_dev` baseline.
- Shut down the server.

- [ ] **Step 7: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/orders/orders.service.ts apps/api/src/orders/orders.controller.ts apps/api/src/orders/orders.service.spec.ts
git commit -m "feat(order-split): rework Order PATCH to customer self-cancel-all-suborders (S3)"
```

---

## Final Verification (before declaring the slice done — RULE.md §5)

- [ ] `npm test` green incl. all new specs; `npx tsc --noEmit` 0 new; `npm run lint` clean on changed files.
- [ ] Live smoke (Task 5 Step 6) all pass; `ecom_dev` cleaned to baseline.
- [ ] Update `docs/IMPLEMENTATION_PLAN.md`: M5a S3 ✅ with a one-line summary.
- [ ] STOP and ask the user to verify (RULE.md §1). Push only when asked.

## Self-Review Notes (author)

- **Spec coverage:** rollup (T1), inventory subOrderId threading (T2), transition service + machine reuse + stock + rollup-in-tx + audit + events (T3), seller API cursor queue + PATCH + admin-bypass scoping + module wiring (T4), Order-level rework to self-cancel + admin removal (T5), UI/admin-reads untouched (not in any task), no migration. All covered.
- **Type consistency:** `rollupOrderStatus(SubOrderStatus[]): OrderStatus` (T1) used in T3/T5; `SubOrderView`/`toSubOrderView` (T3) returned by T4 list + T4 PATCH; `release/deduct/restock(...subOrderId)` (T2) called by `applyStockForStatus` (T3c); `SUBORDER_STATUS_CHANGED_EVENT`/`SUBORDER_STATUS_CHANGED` defined T3, used T3/T5; `ScopeActor` from products/seller-scope reused.
- **ADMIN-bypass `@CurrentSeller` nuance (verified + resolved):** `RolesGuard` does `required.includes(user.role)` (so `@Roles(SELLER)` alone 403s admins → class uses `@Roles(SELLER, ADMIN)`); `@CurrentSeller` throws when `sellerId` is unset (admin bypass sets none → controller reads `@Req().sellerId` + branches on `user.role`). T4 gives the single, correct controller verbatim — no derivation left to the implementer.
- **No placeholders in code steps:** every code step (incl. the T5 `updateStatus` rewrite) shows the full body. T5 Step 3 is complete code, not prose.
