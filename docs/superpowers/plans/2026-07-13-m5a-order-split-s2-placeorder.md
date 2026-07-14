# M5a S2 — placeOrder Writes SubOrders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `OrdersService.placeOrder` so a multi-seller cart produces 1 `Order` + N `SubOrder`s (one per distinct `Product.seller`), each with its own per-seller totals + item/shipping snapshots, stock reserved per SubOrderItem writing `subOrderId` — while keeping the `Order` + its `OrderItem`s exactly as today (dual-write) so no read path breaks.

**Architecture:** Two new pure helpers (`sum-totals.ts` aggregates per-seller `CartTotals` in integer cents; `group-by-seller.ts` partitions validated cart lines by seller) feed a rewritten `placeOrder` that runs the existing pure `priceItems` once per seller-group, creates the Order (aggregate totals + all OrderItems) and N SubOrders (+SubOrderItems) in one transaction, and reserves per line via an additively-extended `inventory.reserve(...subOrderId?)`. `updateStatus`/state machine and the `GET /orders/:id` response shape are untouched.

**Tech Stack:** NestJS + Prisma 7 + PostgreSQL (`ecom_dev`), Jest. Reuses `cart/totals.ts` (`computeTotals`/`centsToString`), `cart/cart-pricing.ts` (`priceItems`/`PricingItem`/`PricedLine`), and the S1 `SubOrder`/`SubOrderItem` models.

## Global Constraints

- **Per-seller pipeline; Order = exact integer-cents SUM of SubOrders.** Run `priceItems` once per seller-group; `Order.{subtotal,discountTotal,taxTotal,shippingTotal,grandTotal}` = the summed group totals. Invariant `Order.grandTotal === Σ SubOrder.grandTotal` (and each component) must hold. Sum in **integer cents** (parse the 2-dp strings → cents → sum → `centsToString`), never sum formatted strings.
- **Shipping applies per seller** (each group's own flat-shipping / free-shipping-threshold decision) — intended marketplace behavior; do not try to preserve today's single-cart shipping total.
- **Dual-write `OrderItem`.** The `Order` still gets all its `OrderItem`s (every priced line across all groups), shape byte-identical to today. `OrderItem` is NOT dropped (Wave C4).
- **Reserve writes BOTH refs.** Extend `reserve` + private `apply` with an optional `subOrderId`; the movement row gets both `orderId` and `subOrderId`. Existing callers (omitting it) are unaffected — `subOrderId: null`.
- **`updateStatus` untouched.** No state-machine / rollup / `suborder.*` event / `release`-`deduct`-`restock` threading in S2 (all S3). `toOrderView` + `GET /orders/:id` response shape unchanged.
- **Every product has a non-null `sellerId`** (M2). Grouping throws (never silently drops) if a line has no resolvable seller.
- **No migration in S2** (schema already on `main`). No coupons (`discountTotal` stays 0, M6b).
- **Strict TS, no `any`** in implementation (test-mock `any` with the repo's eslint-disable header is fine). 3 pre-existing M2/M3 spec tsc errors are known — assert **0 new**.
- **Commands** (from `apps/api/`): `npm test -- <pattern>`, `npm test`, `npx tsc --noEmit`, `npm run lint`. Branch `feat/order-split-s2`. Push only; user lands the PR.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/orders/sum-totals.ts` (create) | Pure `sumTotals(parts: CartTotals[]): CartTotals` + `moneyStringToCents`. |
| `apps/api/src/orders/sum-totals.spec.ts` (create) | Unit tests. |
| `apps/api/src/orders/group-by-seller.ts` (create) | Pure `groupCartLinesBySeller(lines: SellerLine[]): SellerGroup[]` + the `SellerLine`/`SellerGroup` types. |
| `apps/api/src/orders/group-by-seller.spec.ts` (create) | Unit tests. |
| `apps/api/src/inventory/inventory.service.ts` (modify) | `reserve` + `apply` gain optional `subOrderId`, written on the movement. |
| `apps/api/src/inventory/inventory.service.spec.ts` (modify) | Tests: movement carries both refs / works without subOrderId. |
| `apps/api/src/orders/orders.service.ts` (modify) | `CART_FOR_CHECKOUT` gains `product.seller`; `placeOrder` rewrite. |
| `apps/api/src/orders/orders.service.spec.ts` (modify) | placeOrder tests updated for split + parity + reserve subOrderId. |

Build order: sum-totals (T1) → group-by-seller (T2) → reserve extension (T3) → placeOrder rewrite + verification (T4). Pure helpers first so `placeOrder` consumes tested units.

---

### Task 1: `sumTotals` pure aggregator

**Files:**
- Create: `apps/api/src/orders/sum-totals.ts`
- Test: `apps/api/src/orders/sum-totals.spec.ts`

**Interfaces:**
- Consumes: `CartTotals` + `centsToString` from `../cart/totals`.
- Produces: `moneyStringToCents(s: string): number`; `sumTotals(parts: CartTotals[]): CartTotals`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/orders/sum-totals.spec.ts`:

```ts
import { sumTotals, moneyStringToCents } from './sum-totals';
import type { CartTotals } from '../cart/totals';

const t = (
  subtotal: string,
  discountTotal: string,
  taxTotal: string,
  shippingTotal: string,
  grandTotal: string,
): CartTotals => ({ subtotal, discountTotal, taxTotal, shippingTotal, grandTotal });

describe('moneyStringToCents', () => {
  it('parses 2-dp money strings to integer cents', () => {
    expect(moneyStringToCents('48.98')).toBe(4898);
    expect(moneyStringToCents('10.00')).toBe(1000);
    expect(moneyStringToCents('0.00')).toBe(0);
    expect(moneyStringToCents('100.05')).toBe(10005);
  });
});

describe('sumTotals', () => {
  it('sums each field across parts and formats as 2-dp strings', () => {
    const a = t('48.98', '0.00', '4.90', '5.00', '58.88');
    const b = t('10.00', '0.00', '1.00', '5.00', '16.00');
    expect(sumTotals([a, b])).toEqual(
      t('58.98', '0.00', '5.90', '10.00', '74.88'),
    );
  });

  it('sums shipping per part (two flat-shipping groups do NOT dedupe)', () => {
    const a = t('20.00', '0.00', '2.00', '5.00', '27.00');
    const b = t('20.00', '0.00', '2.00', '5.00', '27.00');
    expect(sumTotals([a, b]).shippingTotal).toBe('10.00');
    expect(sumTotals([a, b]).grandTotal).toBe('54.00');
  });

  it('returns all-zero totals for an empty parts array', () => {
    expect(sumTotals([])).toEqual(t('0.00', '0.00', '0.00', '0.00', '0.00'));
  });

  it('is exact with no float drift on values that sum across a dollar boundary', () => {
    const a = t('0.99', '0.00', '0.00', '0.00', '0.99');
    const b = t('0.02', '0.00', '0.00', '0.00', '0.02');
    expect(sumTotals([a, b]).grandTotal).toBe('1.01');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npm test -- sum-totals.spec.ts`
Expected: FAIL — cannot resolve `./sum-totals`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/orders/sum-totals.ts`:

```ts
import { centsToString, type CartTotals } from '../cart/totals';

/** Inverse of centsToString: parse a 2-dp money string to integer cents.
 *  Handles an optional leading '-'. Avoids float math on the whole value. */
export function moneyStringToCents(value: string): number {
  const negative = value.startsWith('-');
  const abs = negative ? value.slice(1) : value;
  const [dollars, cents = '0'] = abs.split('.');
  const total = Number(dollars) * 100 + Number(cents.padEnd(2, '0').slice(0, 2));
  return negative ? -total : total;
}

const FIELDS = [
  'subtotal',
  'discountTotal',
  'taxTotal',
  'shippingTotal',
  'grandTotal',
] as const;

/** Sum per-seller CartTotals into one aggregate, in integer cents (no float
 *  drift), formatting each field back to a 2-dp string. */
export function sumTotals(parts: CartTotals[]): CartTotals {
  const cents: Record<(typeof FIELDS)[number], number> = {
    subtotal: 0,
    discountTotal: 0,
    taxTotal: 0,
    shippingTotal: 0,
    grandTotal: 0,
  };
  for (const part of parts) {
    for (const f of FIELDS) cents[f] += moneyStringToCents(part[f]);
  }
  return {
    subtotal: centsToString(cents.subtotal),
    discountTotal: centsToString(cents.discountTotal),
    taxTotal: centsToString(cents.taxTotal),
    shippingTotal: centsToString(cents.shippingTotal),
    grandTotal: centsToString(cents.grandTotal),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npm test -- sum-totals.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/orders/sum-totals.ts apps/api/src/orders/sum-totals.spec.ts
git commit -m "feat(order-split): sumTotals pure per-seller totals aggregator (S2)"
```

---

### Task 2: `groupCartLinesBySeller` pure grouper

**Files:**
- Create: `apps/api/src/orders/group-by-seller.ts`
- Test: `apps/api/src/orders/group-by-seller.spec.ts`

**Interfaces:**
- Consumes: `PricingItem` from `../cart/cart-pricing`.
- Produces:
  - `interface SellerLine { sellerId: string; sellerName: string; item: PricingItem }`
  - `interface SellerGroup { sellerId: string; sellerName: string; items: PricingItem[] }`
  - `groupCartLinesBySeller(lines: SellerLine[]): SellerGroup[]` — partitions by `sellerId`, deterministic order (ascending `sellerId`), throws on a falsy `sellerId`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/orders/group-by-seller.spec.ts`:

```ts
import { groupCartLinesBySeller, type SellerLine } from './group-by-seller';
import type { PricingItem } from '../cart/cart-pricing';

const item = (productId: string): PricingItem => ({
  productId,
  quantity: 1,
  product: { name: productId, price: '10.00', salePrice: null },
});

const line = (sellerId: string, sellerName: string, productId: string): SellerLine => ({
  sellerId,
  sellerName,
  item: item(productId),
});

describe('groupCartLinesBySeller', () => {
  it('returns one group for a single-seller cart', () => {
    const groups = groupCartLinesBySeller([
      line('s1', 'Shop One', 'p1'),
      line('s1', 'Shop One', 'p2'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sellerId).toBe('s1');
    expect(groups[0].sellerName).toBe('Shop One');
    expect(groups[0].items.map((i) => i.productId)).toEqual(['p1', 'p2']);
  });

  it('partitions a multi-seller cart into N groups in deterministic (ascending sellerId) order', () => {
    const groups = groupCartLinesBySeller([
      line('s2', 'Shop Two', 'p3'),
      line('s1', 'Shop One', 'p1'),
      line('s2', 'Shop Two', 'p4'),
    ]);
    expect(groups.map((g) => g.sellerId)).toEqual(['s1', 's2']);
    expect(groups[0].items.map((i) => i.productId)).toEqual(['p1']);
    expect(groups[1].items.map((i) => i.productId)).toEqual(['p3', 'p4']);
  });

  it('carries sellerName from the line', () => {
    const groups = groupCartLinesBySeller([line('s1', 'Demo Shop', 'p1')]);
    expect(groups[0].sellerName).toBe('Demo Shop');
  });

  it('throws if a line has no resolvable seller', () => {
    expect(() =>
      groupCartLinesBySeller([line('', 'x', 'p1')]),
    ).toThrow(/seller/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npm test -- group-by-seller.spec.ts`
Expected: FAIL — cannot resolve `./group-by-seller`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/orders/group-by-seller.ts`:

```ts
import type { PricingItem } from '../cart/cart-pricing';

/** A validated cart line paired with its seller (from product.seller). */
export interface SellerLine {
  sellerId: string;
  sellerName: string;
  item: PricingItem;
}

/** One seller's slice of the cart: the seller + that seller's priced-input items. */
export interface SellerGroup {
  sellerId: string;
  sellerName: string;
  items: PricingItem[];
}

/**
 * Partition validated cart lines by seller into one SellerGroup per distinct
 * sellerId. Deterministic order (ascending sellerId) so output is stable and
 * testable. Throws on a line with no resolvable seller — every Product has a
 * non-null sellerId (M2), so this is a defensive guard, not an expected path.
 */
export function groupCartLinesBySeller(lines: SellerLine[]): SellerGroup[] {
  const bySeller = new Map<string, SellerGroup>();
  for (const line of lines) {
    if (!line.sellerId) {
      throw new Error(
        `Cart line for product '${line.item.productId}' has no resolvable seller.`,
      );
    }
    let group = bySeller.get(line.sellerId);
    if (!group) {
      group = { sellerId: line.sellerId, sellerName: line.sellerName, items: [] };
      bySeller.set(line.sellerId, group);
    }
    group.items.push(line.item);
  }
  return [...bySeller.values()].sort((a, b) =>
    a.sellerId < b.sellerId ? -1 : a.sellerId > b.sellerId ? 1 : 0,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npm test -- group-by-seller.spec.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/orders/group-by-seller.ts apps/api/src/orders/group-by-seller.spec.ts
git commit -m "feat(order-split): groupCartLinesBySeller pure grouper (S2)"
```

---

### Task 3: Extend `inventory.reserve`/`apply` with `subOrderId`

**Files:**
- Modify: `apps/api/src/inventory/inventory.service.ts` (`reserve` ~line 113, `apply` ~line 598)
- Test: `apps/api/src/inventory/inventory.service.spec.ts`

**Interfaces:**
- Produces: `reserve(productId: string, quantity: number, orderId?: string, tx?: Prisma.TransactionClient, subOrderId?: string): Promise<LowStockEvent | null>` — movement now carries both `orderId` and `subOrderId`.

- [ ] **Step 1: Write the failing test**

Add a new `describe` to `apps/api/src/inventory/inventory.service.spec.ts`, reusing the file's existing `build()` helper and `item()` factory (the service is constructed by `build()` → `{ svc, prisma, ... }`; the stored row comes from `item()`; `requireItem` reads it via `prisma.inventoryItem.findFirst`). The test asserts the movement row's `subOrderId`:

```ts
describe('InventoryService.reserve subOrderId', () => {
  it('writes both orderId and subOrderId on the reservation movement when subOrderId is provided', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findFirst.mockResolvedValue(item());
    prisma.inventoryItem.update.mockResolvedValue(item({ available: 8, reserved: 2 }));
    await svc.reserve('p1', 2, 'order1', undefined, 'sub1');
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderId: 'order1', subOrderId: 'sub1' }),
      }),
    );
  });

  it('writes subOrderId: null when omitted (existing callers unaffected)', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findFirst.mockResolvedValue(item());
    prisma.inventoryItem.update.mockResolvedValue(item({ available: 8, reserved: 2 }));
    await svc.reserve('p1', 2, 'order1');
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderId: 'order1', subOrderId: null }),
      }),
    );
  });
});
```

*Note:* `build()` and `item()` already exist in this spec file (verified); reuse them rather than hand-rolling a mock. Keep both assertions (both-refs / null-when-omitted).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npm test -- inventory.service.spec.ts`
Expected: FAIL — `subOrderId` is not on the movement `data` (current `apply` omits it).

- [ ] **Step 3: Write minimal implementation**

In `apps/api/src/inventory/inventory.service.ts`, extend `reserve` to accept + forward `subOrderId`:

```ts
  async reserve(
    productId: string,
    quantity: number,
    orderId?: string,
    tx?: Prisma.TransactionClient,
    subOrderId?: string,
  ): Promise<LowStockEvent | null> {
    const item = await this.requireItem(productId, SYSTEM_ACTOR, tx);
    if (item.available < quantity) {
      throw new BadRequestException('Insufficient stock available to reserve');
    }
    await this.apply(
      item.id,
      {
        counters: {
          available: { decrement: quantity },
          reserved: { increment: quantity },
        },
        type: MovementType.RESERVATION,
        delta: -quantity,
        orderId,
        subOrderId,
      },
      tx,
    );
    // The remaining lines of reserve() are UNCHANGED — keep them exactly as they
    // are today (the `lowStockCrossing(item, item.available - quantity)` call, the
    // `if (crossing && !tx) { emit; return null }` deferred-emit branch, and the
    // final `return crossing;`). Only the signature (+subOrderId) and the `apply`
    // call's `move` object (+subOrderId) change in this method.
  }
```

And extend the private `apply` `move` param + the movement write:

```ts
  private async apply(
    inventoryItemId: string,
    move: {
      counters: Prisma.InventoryItemUpdateInput;
      type: MovementType;
      delta: number;
      orderId?: string;
      subOrderId?: string;
      reason?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const run = async (db: PrismaLike) => {
      await db.inventoryItem.update({
        where: { id: inventoryItemId },
        data: move.counters,
      });
      await db.inventoryMovement.create({
        data: {
          inventoryItemId,
          type: move.type,
          quantity: move.delta,
          orderId: move.orderId ?? null,
          subOrderId: move.subOrderId ?? null,
          reason: move.reason ?? null,
        },
      });
    };
    if (tx) {
      await run(tx);
    } else {
      await this.prisma.$transaction(run);
    }
  }
```

Leave `release`/`deduct`/`restock` unchanged (they don't pass `subOrderId`; it defaults to `null` — S3 will thread them).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npm test -- inventory.service.spec.ts`
Expected: PASS — both new tests plus all existing inventory tests (the added optional param + nullish `subOrderId` don't change any existing behavior).

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/inventory/inventory.service.ts apps/api/src/inventory/inventory.service.spec.ts
git commit -m "feat(order-split): reserve/apply accept subOrderId, write both refs (S2)"
```

---

### Task 4: Rewrite `placeOrder` to split by seller + verification

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts` (`CART_FOR_CHECKOUT` ~line 91, `placeOrder` ~line 125)
- Test: `apps/api/src/orders/orders.service.spec.ts`

**Interfaces:**
- Consumes: `sumTotals` (Task 1), `groupCartLinesBySeller` + `SellerLine` (Task 2), `reserve(...subOrderId)` (Task 3), existing `priceItems`.

- [ ] **Step 1: Update the test scaffolding + write the failing split tests**

In `apps/api/src/orders/orders.service.spec.ts`: (a) add `subOrder: { create: jest.fn() }` to `makePrisma`; (b) extend `activeLine`'s `product` to include `seller: { id, displayName }`; (c) make `prisma.subOrder.create` resolve an object with a stable `id` (e.g. based on `sellerId`); (d) add these tests. Read the current file (esp. `build()`, `activeLine`, `createdOrder`) and adapt to its conventions.

```ts
// In makePrisma(), add to the `prisma` object literal:
//   subOrder: { create: jest.fn() },
// and after prisma.$transaction is defined, give subOrder.create a default:
//   prisma.subOrder.create = jest.fn(async ({ data }: any) =>
//     ({ id: `sub-${data.sellerId}`, ...data }));

// activeLine(): add seller to product:
//   product: { name, price, salePrice, status, deletedAt,
//              seller: { id: 's1', displayName: 'Shop One' } }

describe('OrdersService.placeOrder — order split', () => {
  it('creates one SubOrder per distinct seller with its own items + sellerName', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(
      cartWith([
        activeLine({ productId: 'p1', product: { ...activeProduct('s1', 'Shop One') } }),
        activeLine({ productId: 'p2', product: { ...activeProduct('s2', 'Shop Two') } }),
      ]),
    );
    prisma.order.create.mockResolvedValue(createdOrder);
    await svc.placeOrder('u1', shipping);

    expect(prisma.subOrder.create).toHaveBeenCalledTimes(2);
    const sellerIds = prisma.subOrder.create.mock.calls.map(
      (c: any) => c[0].data.sellerId,
    );
    expect(sellerIds.sort()).toEqual(['s1', 's2']);
    // each SubOrder carries the shipping snapshot + PENDING status
    const first = prisma.subOrder.create.mock.calls[0][0].data;
    expect(first.status).toBe('PENDING');
    expect(first.shipFullName).toBe(shipping.shipFullName);
    // SubOrderItems carry sellerName
    expect(first.items.create[0].sellerName).toBeDefined();
  });

  it('creates ONE Order whose totals equal the sum of the SubOrders (parity)', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(
      cartWith([
        activeLine({ productId: 'p1', product: { ...activeProduct('s1', 'Shop One') } }),
        activeLine({ productId: 'p2', product: { ...activeProduct('s2', 'Shop Two') } }),
      ]),
    );
    prisma.order.create.mockResolvedValue(createdOrder);
    await svc.placeOrder('u1', shipping);

    const orderData = prisma.order.create.mock.calls[0][0].data;
    const subCalls = prisma.subOrder.create.mock.calls.map((c: any) => c[0].data);
    const sumCents = (f: string) =>
      subCalls.reduce((n: number, s: any) => n + moneyStringToCents(s[f]), 0);
    // Order component == sum of SubOrder components (integer-cents equality)
    expect(moneyStringToCents(orderData.grandTotal)).toBe(sumCents('grandTotal'));
    expect(moneyStringToCents(orderData.subtotal)).toBe(sumCents('subtotal'));
    expect(moneyStringToCents(orderData.shippingTotal)).toBe(sumCents('shippingTotal'));
    // Order still gets ALL OrderItems (dual-write)
    expect(orderData.items.create).toHaveLength(2);
  });

  it('reserves each line with its owning subOrderId (5th arg)', async () => {
    const { svc, prisma, inventory } = build();
    prisma.cart.findFirst.mockResolvedValue(
      cartWith([activeLine({ productId: 'p1', product: { ...activeProduct('s1', 'Shop One') } })]),
    );
    prisma.order.create.mockResolvedValue(createdOrder);
    await svc.placeOrder('u1', shipping);
    // reserve(productId, qty, orderId, tx, subOrderId)
    expect(inventory.reserve).toHaveBeenCalledWith('p1', 2, 'order1', prisma, 'sub-s1');
  });

  it('single-seller cart → 1 Order + 1 SubOrder', async () => {
    const { svc, prisma } = build();
    prisma.cart.findFirst.mockResolvedValue(
      cartWith([activeLine({ productId: 'p1', product: { ...activeProduct('s1', 'Shop One') } })]),
    );
    prisma.order.create.mockResolvedValue(createdOrder);
    await svc.placeOrder('u1', shipping);
    expect(prisma.subOrder.create).toHaveBeenCalledTimes(1);
  });
});
```

Add a small helper near `activeLine` in the spec:

```ts
const activeProduct = (sellerId: string, displayName: string) => ({
  name: 'Mouse',
  price: '19.99',
  salePrice: null,
  status: ProductStatus.ACTIVE,
  deletedAt: null,
  seller: { id: sellerId, displayName },
});
```

and import `moneyStringToCents` from `./sum-totals` at the top of the spec.

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd apps/api && npm test -- orders.service.spec.ts`
Expected: FAIL — `placeOrder` doesn't create SubOrders / doesn't pass `subOrderId` yet. (The existing placeOrder test asserting `reserve('p1', 2, 'order1', prisma)` will also fail — you update it in Step 3 to the 5-arg form.)

- [ ] **Step 3: Rewrite `placeOrder` + extend the cart include**

In `apps/api/src/orders/orders.service.ts`:

(a) Add imports:
```ts
import { sumTotals } from './sum-totals';
import { groupCartLinesBySeller, type SellerLine } from './group-by-seller';
```

(b) Extend `CART_FOR_CHECKOUT` product select to include the seller:
```ts
const CART_FOR_CHECKOUT = {
  items: {
    include: {
      product: {
        select: {
          name: true,
          price: true,
          salePrice: true,
          status: true,
          deletedAt: true,
          seller: { select: { id: true, displayName: true } },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;
```

(c) Rewrite `placeOrder` (replace the current body from the cart load through the return):

```ts
  async placeOrder(userId: string, dto: CheckoutDto): Promise<OrderView> {
    const cart = await this.prisma.cart.findFirst({
      where: { userId },
      include: CART_FOR_CHECKOUT,
    });
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }

    // Validate each line and pair it with its seller (for grouping) + pricer input.
    const sellerLines: SellerLine[] = cart.items.map((item) => {
      const p = item.product;
      if (p.deletedAt !== null || p.status !== ProductStatus.ACTIVE) {
        throw new BadRequestException(
          `'${p.name}' is no longer available; remove it to checkout`,
        );
      }
      return {
        sellerId: p.seller.id,
        sellerName: p.seller.displayName,
        item: {
          productId: item.productId,
          quantity: item.quantity,
          product: {
            name: p.name,
            price: p.price.toString(),
            salePrice: p.salePrice !== null ? p.salePrice.toString() : null,
          },
        },
      };
    });

    // Group by seller; price each group; the Order total is the sum of groups.
    const groups = groupCartLinesBySeller(sellerLines).map((g) => ({
      ...g,
      priced: priceItems(g.items, this.totalsConfig),
    }));
    const orderTotals = sumTotals(groups.map((g) => g.priced.totals));
    const allLines = groups.flatMap((g) => g.priced.lines);

    const ship = {
      shipFullName: dto.shipFullName,
      shipLine1: dto.shipLine1,
      shipLine2: dto.shipLine2 ?? null,
      shipCity: dto.shipCity,
      shipState: dto.shipState,
      shipCountry: dto.shipCountry,
      shipPostalCode: dto.shipPostalCode,
    };

    const { order, lowStockCrossings } = await this.prisma.$transaction(
      async (tx) => {
        // Order: aggregate totals + ALL OrderItems (dual-write, shape unchanged).
        const created = await tx.order.create({
          data: {
            userId,
            status: OrderStatus.PENDING,
            subtotal: orderTotals.subtotal,
            discountTotal: orderTotals.discountTotal,
            taxTotal: orderTotals.taxTotal,
            shippingTotal: orderTotals.shippingTotal,
            grandTotal: orderTotals.grandTotal,
            ...ship,
            items: {
              create: allLines.map((line) => ({
                productId: line.productId,
                productName: line.name,
                unitPrice: line.unitPrice,
                quantity: line.quantity,
                lineTotal: line.lineTotal,
              })),
            },
          },
          include: ORDER_INCLUDE,
        });

        const crossings: LowStockEvent[] = [];
        for (const group of groups) {
          const subOrder = await tx.subOrder.create({
            data: {
              orderId: created.id,
              sellerId: group.sellerId,
              status: SubOrderStatus.PENDING,
              subtotal: group.priced.totals.subtotal,
              discountTotal: group.priced.totals.discountTotal,
              taxTotal: group.priced.totals.taxTotal,
              shippingTotal: group.priced.totals.shippingTotal,
              grandTotal: group.priced.totals.grandTotal,
              ...ship,
              items: {
                create: group.priced.lines.map((line) => ({
                  productId: line.productId,
                  productName: line.name,
                  unitPrice: line.unitPrice,
                  quantity: line.quantity,
                  lineTotal: line.lineTotal,
                  sellerName: group.sellerName,
                })),
              },
            },
          });
          // Reserve per line, referencing BOTH the order and this sub-order.
          for (const line of group.priced.lines) {
            const crossing = await this.inventory.reserve(
              line.productId,
              line.quantity,
              created.id,
              tx,
              subOrder.id,
            );
            if (crossing) crossings.push(crossing);
          }
        }

        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        return { order: created, lowStockCrossings: crossings };
      },
    );

    for (const crossing of lowStockCrossings) {
      this.inventory.emitLowStock(crossing);
    }
    this.events.emit(ORDER_PLACED, { orderId: order.id, userId: order.userId });

    return this.toOrderView(order);
  }
```

(d) Add the `SubOrderStatus` import: `import { ..., SubOrderStatus } from '@prisma/client';` (add to the existing `@prisma/client` import in the file).

(e) Update the **existing** placeOrder reserve assertion (the pre-split test) from `reserve('p1', 2, 'order1', prisma)` to the 5-arg form `reserve('p1', 2, 'order1', prisma, 'sub-s1')` — and ensure that test's `activeLine` has a seller (it will, once `activeLine` is updated in Step 1b).

- [ ] **Step 4: Run the full orders spec + confirm green**

Run: `cd apps/api && npm test -- orders.service.spec.ts`
Expected: PASS — the new split tests + the updated existing tests. If a pre-split test still asserts old behavior (single order.create shape), reconcile it to the new dual-write reality (Order shape is unchanged, so most should pass as-is; only the reserve-arg assertion and any "no subOrder" assumption change).

- [ ] **Step 5: Full suite + typecheck + lint**

Run: `cd apps/api && npm test`
Expected: full suite green (all existing + new).

Run: `npx tsc --noEmit`
Expected: 0 new errors (3 known pre-existing).

Run: `npm run lint`
Expected: the changed files clean. If `--fix` reformats UNRELATED files, do NOT stage them — `git add` only the S2 files, then `git checkout --` any stray reformatted files.

- [ ] **Step 6: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/orders/orders.service.ts apps/api/src/orders/orders.service.spec.ts
git commit -m "feat(order-split): placeOrder splits cart into Order + N SubOrders (S2)"
```

---

## Final Verification (before declaring the slice done — RULE.md §5)

Not a code task — a gate after Task 4.

- [ ] `npm test` (API) green incl. all new specs; `npx tsc --noEmit` 0 new; `npm run lint` clean on changed files.
- [ ] **Live HTTP smoke vs `ecom_dev`** (fresh boot; kill any stale :5000 first, confirm fresh route mapping):
  - [ ] Build a cart with products from **2 distinct sellers** (platform + demo seller `seller@example.com`'s products). Place the order.
  - [ ] Assert in the DB (prisma studio or a quick query): **1 Order + 2 SubOrders** for that order; each SubOrder's `sellerId` correct with its own totals; `Order.grandTotal == SubOrder1.grandTotal + SubOrder2.grandTotal` (and subtotal/tax/shipping components); `count(OrderItem for order) == total lines`; each SubOrderItem `sellerName` matches its seller's displayName.
  - [ ] Inventory: the placement's RESERVATION movements carry both `orderId` and `subOrderId`; reserved counts per product correct.
  - [ ] Single-seller cart → 1 Order + 1 SubOrder.
  - [ ] `GET /orders/:id` response shape identical to before (no SubOrder fields leaked).
  - [ ] Clean up the test order/suborders/movements + restore cart state; confirm counts back to baseline (shared DB).
- [ ] Update `docs/IMPLEMENTATION_PLAN.md`: M5a S2 ✅ with a one-line summary.
- [ ] STOP and ask the user to verify (RULE.md §1). Push only when asked.

## Self-Review Notes (author)

- **Spec coverage:** per-seller pipeline + sum (T1 `sumTotals`, T4 wiring), grouping (T2), reserve both-refs (T3), dual-write OrderItem (T4 order.create with all lines), SubOrder+items with sellerName + ship snapshot (T4), parity invariant (T1 + T4 tests + live), `updateStatus` untouched (not in any task), response shape unchanged (T4 keeps `toOrderView`), no migration (none). All covered.
- **Type consistency:** `sumTotals(CartTotals[]): CartTotals` + `moneyStringToCents` (T1) consumed in T4 tests + impl; `SellerLine`/`SellerGroup`/`groupCartLinesBySeller` (T2) consumed in T4; `reserve(...subOrderId?)` (T3) called in T4 with the 5-arg form; `SubOrderStatus.PENDING` matches the S1 enum.
- **No placeholders:** every code step is complete. Two spec-edit steps (T3 Step 1, T4 Step 1) instruct reading the existing spec file to match its exact mock builder — necessary because those mocks are file-specific; the required assertions are spelled out in full.
