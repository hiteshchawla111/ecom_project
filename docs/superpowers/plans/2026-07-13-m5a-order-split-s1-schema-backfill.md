# M5a S1 — SubOrder Schema + Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the additive `SubOrder`/`SubOrderItem` schema (+ `SubOrderStatus` enum + `InventoryMovement.subOrderId`) and an idempotent backfill that gives every existing `Order` exactly one Platform-Seller `SubOrder`, with **zero behavior change** to any request path.

**Architecture:** Pure data foundation for M5a order-split. Schema lands as one hand-authored additive Prisma migration applied with `migrate deploy` (never `migrate dev`/`reset`, because `ecom_dev` is shared across worktrees). The backfill logic lives in a testable module under `src/orders/` (so Jest covers it) and is invoked by a thin standalone script under `scripts/`. Nothing reads SubOrders yet — `placeOrder`, `updateStatus`, and all read paths are untouched; the existing order + inventory test suites staying green is the regression proof.

**Tech Stack:** NestJS + Prisma 7 (driver adapter `@prisma/adapter-pg`) + PostgreSQL (`ecom_dev`), Jest. Mirrors `apps/api/scripts/backfill-rating-aggregates.ts`, the `20260624120001_add_review` migration, and `DOMAIN_MODEL.md` §3.5.

## Global Constraints

- **Additive only.** No column drops, no NOT-NULL-on-existing, no `OrderItem` drop (that is the later Wave C4 contract migration). Migration must be reversible by dropping the new tables/column.
- **Apply with `npx prisma migrate deploy` — NEVER `migrate dev`/`migrate reset`** (shared `ecom_dev`; sibling worktree migrations must survive). Author the migration folder + SQL by hand (file-diff), matching the existing migration style.
- **Money columns are `Decimal @db.Decimal(12,2)`**; `subtotal`/`grandTotal` required, `discountTotal`/`taxTotal`/`shippingTotal` `@default(0)` — mirror `Order` exactly.
- **Platform Seller** = the `Seller` row with `slug = 'platform'` (seeded in `prisma/seed.ts`). Backfill resolves it via `findUnique({ where: { slug: 'platform' } })`; abort if absent.
- **`SubOrderStatus`** enum = the same 7 values as `OrderStatus`: `PENDING CONFIRMED PROCESSING SHIPPED DELIVERED CANCELLED REFUNDED`.
- **Deferred relations:** do NOT add `SubOrder.shipments`/`returnRequests`/`payout` (those models don't exist until M5c/M6). Add only fields/relations that compile now.
- **Backfill is idempotent** (skip any Order that already has a SubOrder), transactional per order, re-runnable, and asserts `count(Order)==count(distinct SubOrder.orderId)`, `count(OrderItem)==count(SubOrderItem)`, and per-order `Order.grandTotal==SubOrder.grandTotal` before succeeding.
- **Commands** (from `apps/api/`): `npm test -- <pattern>` (single), `npm test` (all), `npx tsc --noEmit`, `npx prisma generate`, `npx prisma migrate deploy`. 3 pre-existing M2/M3 spec tsc errors are known — do not "fix"; assert **0 new**.
- **Branch:** `feat/order-split` (already created off `main`). Push only; user lands the PR.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/schema.prisma` (modify) | Add `SubOrderStatus` enum, `SubOrder` + `SubOrderItem` models, `Order.subOrders` + `Seller.subOrders` back-relations, `InventoryMovement.subOrderId` + index. |
| `apps/api/prisma/migrations/<ts>_add_suborder/migration.sql` (create) | Hand-authored additive DDL: enum, two tables, indexes, FKs, `InventoryMovement.subOrderId` column + index. |
| `apps/api/src/orders/suborder-backfill.ts` (create) | Testable `backfillSubOrders(prisma): Promise<BackfillResult>` — the core logic (resolve platform seller, create one SubOrder+items per un-backfilled Order, validate). |
| `apps/api/src/orders/suborder-backfill.spec.ts` (create) | Unit tests for `backfillSubOrders` (mocked Prisma). |
| `apps/api/scripts/backfill-suborders.ts` (create) | Thin standalone wrapper: build the adapter-based `PrismaClient`, call `backfillSubOrders`, log summary, exit non-zero on failure. |

Build order: schema+migration (Task 1) → backfill core + tests (Task 2) → script wrapper + live verification (Task 3).

---

### Task 1: SubOrder schema + additive migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260713120000_add_suborder/migration.sql`

**Interfaces:**
- Produces (Prisma client models later tasks consume): `SubOrder { id, orderId, sellerId, status: SubOrderStatus, subtotal, discountTotal, taxTotal, shippingTotal, grandTotal, shipFullName, shipLine1, shipLine2?, shipCity, shipState, shipCountry, shipPostalCode, items, createdAt, updatedAt }`; `SubOrderItem { id, subOrderId, productId, productName, unitPrice, quantity, lineTotal, sellerName }`; `InventoryMovement.subOrderId: string | null`.

- [ ] **Step 1: Add the enum + models + relations to `schema.prisma`**

Add this enum near `OrderStatus`:

```prisma
enum SubOrderStatus {
  PENDING
  CONFIRMED
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
  REFUNDED
}
```

Add these two models (place after the `OrderItem` model):

```prisma
model SubOrder {
  id            String         @id @default(cuid())
  order         Order          @relation(fields: [orderId], references: [id])
  orderId       String
  seller        Seller         @relation(fields: [sellerId], references: [id])
  sellerId      String
  status        SubOrderStatus @default(PENDING)

  subtotal      Decimal        @db.Decimal(12, 2)
  discountTotal Decimal        @db.Decimal(12, 2) @default(0)
  taxTotal      Decimal        @db.Decimal(12, 2) @default(0)
  shippingTotal Decimal        @db.Decimal(12, 2) @default(0)
  grandTotal    Decimal        @db.Decimal(12, 2)

  shipFullName   String
  shipLine1      String
  shipLine2      String?
  shipCity       String
  shipState      String
  shipCountry    String
  shipPostalCode String

  items     SubOrderItem[]
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  @@index([orderId])
  @@index([sellerId, status, createdAt])
  @@index([status])
}

model SubOrderItem {
  id          String   @id @default(cuid())
  subOrder    SubOrder @relation(fields: [subOrderId], references: [id], onDelete: Cascade)
  subOrderId  String
  productId   String
  productName String
  unitPrice   Decimal  @db.Decimal(12, 2)
  quantity    Int
  lineTotal   Decimal  @db.Decimal(12, 2)
  sellerName  String

  @@index([subOrderId])
  @@index([productId])
}
```

In the existing `Order` model, add the back-relation (next to `items OrderItem[]`):

```prisma
  subOrders       SubOrder[]
```

In the existing `Seller` model, add the back-relation (next to `products Product[]`):

```prisma
  subOrders      SubOrder[]
```

In the existing `InventoryMovement` model, add the column + index (next to the existing `orderId String?` and its `@@index([orderId])`):

```prisma
  subOrderId      String?
  // ... (with the other @@index lines)
  @@index([subOrderId])
```

- [ ] **Step 2: Regenerate the Prisma client and verify it compiles**

Run: `cd apps/api && npx prisma generate`
Expected: "Generated Prisma Client" with no schema errors.

Run: `npx tsc --noEmit`
Expected: only the 3 known pre-existing M2/M3 spec errors (0 new). The new models compile.

- [ ] **Step 3: Hand-author the additive migration SQL**

Create `apps/api/prisma/migrations/20260713120000_add_suborder/migration.sql` (mirror the `20260624120001_add_review` style — enum, CreateTable, CreateIndex, AddForeignKey):

```sql
-- CreateEnum
CREATE TYPE "SubOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED');

-- CreateTable
CREATE TABLE "SubOrder" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "status" "SubOrderStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shippingTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(12,2) NOT NULL,
    "shipFullName" TEXT NOT NULL,
    "shipLine1" TEXT NOT NULL,
    "shipLine2" TEXT,
    "shipCity" TEXT NOT NULL,
    "shipState" TEXT NOT NULL,
    "shipCountry" TEXT NOT NULL,
    "shipPostalCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubOrderItem" (
    "id" TEXT NOT NULL,
    "subOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "sellerName" TEXT NOT NULL,
    CONSTRAINT "SubOrderItem_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN "subOrderId" TEXT;

-- CreateIndex
CREATE INDEX "SubOrder_orderId_idx" ON "SubOrder"("orderId");
CREATE INDEX "SubOrder_sellerId_status_createdAt_idx" ON "SubOrder"("sellerId", "status", "createdAt");
CREATE INDEX "SubOrder_status_idx" ON "SubOrder"("status");
CREATE INDEX "SubOrderItem_subOrderId_idx" ON "SubOrderItem"("subOrderId");
CREATE INDEX "SubOrderItem_productId_idx" ON "SubOrderItem"("productId");
CREATE INDEX "InventoryMovement_subOrderId_idx" ON "InventoryMovement"("subOrderId");

-- AddForeignKey
ALTER TABLE "SubOrder" ADD CONSTRAINT "SubOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubOrder" ADD CONSTRAINT "SubOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubOrderItem" ADD CONSTRAINT "SubOrderItem_subOrderId_fkey" FOREIGN KEY ("subOrderId") REFERENCES "SubOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Verify the migration SQL matches the schema (drift check, non-destructive)**

Run (from `apps/api`): `npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --exit-code`
Expected: exit code **0** ("No difference detected") — i.e. the hand-authored SQL fully expresses the schema change. If it reports a diff, reconcile the SQL to match the schema (do NOT edit the schema to match a wrong SQL).

*(Note: this diff compares the migrations history against the schema without touching the DB. It does not connect to `ecom_dev`.)*

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260713120000_add_suborder
git commit -m "feat(order-split): SubOrder/SubOrderItem schema + additive migration (C1/C2)"
```

---

### Task 2: Backfill core logic + tests

**Files:**
- Create: `apps/api/src/orders/suborder-backfill.ts`
- Create: `apps/api/src/orders/suborder-backfill.spec.ts`

**Interfaces:**
- Consumes: the Prisma models from Task 1 (`subOrder`, `subOrderItem`, `order`, `orderItem`, `seller`).
- Produces: `interface BackfillResult { ordersProcessed: number; subOrdersCreated: number; subOrderItemsCreated: number }`; `async function backfillSubOrders(prisma: PrismaClient): Promise<BackfillResult>` — resolves the platform seller (throws if missing), creates one SubOrder + items per Order that has none, runs validation asserts (throws on mismatch), returns counts.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/orders/suborder-backfill.spec.ts`:

```ts
import { backfillSubOrders } from './suborder-backfill';

/** Minimal in-memory-ish mock of the Prisma surface backfillSubOrders touches. */
function makePrismaMock(opts: {
  platform: { id: string } | null;
  orders: Array<{
    id: string;
    status: string;
    subtotal: string; discountTotal: string; taxTotal: string; shippingTotal: string; grandTotal: string;
    shipFullName: string; shipLine1: string; shipLine2: string | null;
    shipCity: string; shipState: string; shipCountry: string; shipPostalCode: string;
    items: Array<{ productId: string; productName: string; unitPrice: string; quantity: number; lineTotal: string }>;
    alreadyBackfilled?: boolean;
  }>;
}) {
  const createdSubOrders: any[] = [];
  const createdItems: any[] = [];
  const prisma: any = {
    seller: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.slug === 'platform' ? opts.platform : null,
      ),
    },
    order: {
      findMany: jest.fn(async () =>
        // emulate `where: { subOrders: { none: {} } }`
        opts.orders.filter((o) => !o.alreadyBackfilled),
      ),
      count: jest.fn(async () => opts.orders.length),
    },
    orderItem: {
      count: jest.fn(async () => opts.orders.reduce((n, o) => n + o.items.length, 0)),
    },
    subOrder: {
      create: jest.fn(async ({ data }: any) => {
        const so = { id: `so-${createdSubOrders.length + 1}`, ...data };
        createdSubOrders.push(so);
        return so;
      }),
      count: jest.fn(async () => createdSubOrders.length),
      findMany: jest.fn(async () => createdSubOrders),
    },
    subOrderItem: {
      create: jest.fn(async ({ data }: any) => {
        createdItems.push(data);
        return data;
      }),
      count: jest.fn(async () => createdItems.length),
    },
    // backfill wraps each order in a tx; the mock just runs the callback with itself
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  return { prisma, createdSubOrders, createdItems };
}

const ORDER = {
  id: 'o1', status: 'DELIVERED',
  subtotal: '100.00', discountTotal: '0.00', taxTotal: '8.00', shippingTotal: '5.00', grandTotal: '113.00',
  shipFullName: 'Ada L', shipLine1: '1 St', shipLine2: null,
  shipCity: 'Town', shipState: 'ST', shipCountry: 'US', shipPostalCode: '00001',
  items: [{ productId: 'p1', productName: 'Widget', unitPrice: '50.00', quantity: 2, lineTotal: '100.00' }],
};

describe('backfillSubOrders', () => {
  it('creates one SubOrder per Order, owned by the platform seller, status + totals + ship copied', async () => {
    const { prisma, createdSubOrders } = makePrismaMock({ platform: { id: 'plat' }, orders: [ORDER] });
    const result = await backfillSubOrders(prisma);

    expect(createdSubOrders).toHaveLength(1);
    const so = createdSubOrders[0];
    expect(so.sellerId).toBe('plat');
    expect(so.orderId).toBe('o1');
    expect(so.status).toBe('DELIVERED');
    expect(so.grandTotal).toBe('113.00');
    expect(so.shipFullName).toBe('Ada L');
    expect(so.shipLine2).toBeNull();
    expect(result.ordersProcessed).toBe(1);
    expect(result.subOrdersCreated).toBe(1);
  });

  it('creates one SubOrderItem per OrderItem with sellerName "Platform" and snapshot fields', async () => {
    const { prisma, createdItems } = makePrismaMock({ platform: { id: 'plat' }, orders: [ORDER] });
    await backfillSubOrders(prisma);
    expect(createdItems).toHaveLength(1);
    expect(createdItems[0]).toMatchObject({
      productId: 'p1', productName: 'Widget', unitPrice: '50.00', quantity: 2, lineTotal: '100.00',
      sellerName: 'Platform',
    });
  });

  it('is idempotent — orders already having a SubOrder are skipped (nothing created)', async () => {
    const { prisma, createdSubOrders } = makePrismaMock({
      platform: { id: 'plat' },
      orders: [{ ...ORDER, alreadyBackfilled: true }],
    });
    const result = await backfillSubOrders(prisma);
    expect(createdSubOrders).toHaveLength(0);
    expect(result.subOrdersCreated).toBe(0);
  });

  it('throws if the platform seller is missing', async () => {
    const { prisma } = makePrismaMock({ platform: null, orders: [ORDER] });
    await expect(backfillSubOrders(prisma)).rejects.toThrow(/platform seller/i);
  });

  it('throws when validation asserts fail (item count mismatch)', async () => {
    const { prisma } = makePrismaMock({ platform: { id: 'plat' }, orders: [ORDER] });
    // Force a mismatch: report more OrderItems than SubOrderItems created.
    prisma.orderItem.count = jest.fn(async () => 99);
    await expect(backfillSubOrders(prisma)).rejects.toThrow(/count\(OrderItem\)/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npm test -- suborder-backfill.spec.ts`
Expected: FAIL — cannot resolve `./suborder-backfill`.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/api/src/orders/suborder-backfill.ts`:

```ts
import type { PrismaClient, SubOrderStatus } from '@prisma/client';

export interface BackfillResult {
  ordersProcessed: number;
  subOrdersCreated: number;
  subOrderItemsCreated: number;
}

const PLATFORM_SLUG = 'platform';

/**
 * Idempotent backfill: give every Order that has no SubOrder exactly one
 * Platform-Seller SubOrder (+ items copied from OrderItems). Re-runnable
 * (skips already-backfilled orders). Throws if the platform seller is missing
 * or if the post-run validation asserts fail. Runs outside Nest DI.
 */
export async function backfillSubOrders(
  prisma: PrismaClient,
): Promise<BackfillResult> {
  const platform = await prisma.seller.findUnique({
    where: { slug: PLATFORM_SLUG },
    select: { id: true },
  });
  if (!platform) {
    throw new Error(
      `Cannot backfill: platform seller (slug "${PLATFORM_SLUG}") not found — run the seed first.`,
    );
  }

  // Orders with no SubOrder yet (idempotency guard).
  const orders = await prisma.order.findMany({
    where: { subOrders: { none: {} } },
    include: { items: true },
  });

  let subOrdersCreated = 0;
  let subOrderItemsCreated = 0;

  for (const order of orders) {
    await prisma.$transaction(async (tx) => {
      const subOrder = await tx.subOrder.create({
        data: {
          orderId: order.id,
          sellerId: platform.id,
          // OrderStatus and SubOrderStatus are distinct Prisma enum types with
          // identical string values (PENDING…REFUNDED). Map by value; the cast
          // is safe because the value sets are identical (see SubOrderStatus enum).
          status: order.status as unknown as SubOrderStatus,
          subtotal: order.subtotal,
          discountTotal: order.discountTotal,
          taxTotal: order.taxTotal,
          shippingTotal: order.shippingTotal,
          grandTotal: order.grandTotal,
          shipFullName: order.shipFullName,
          shipLine1: order.shipLine1,
          shipLine2: order.shipLine2,
          shipCity: order.shipCity,
          shipState: order.shipState,
          shipCountry: order.shipCountry,
          shipPostalCode: order.shipPostalCode,
        },
      });
      subOrdersCreated += 1;

      for (const item of order.items) {
        await tx.subOrderItem.create({
          data: {
            subOrderId: subOrder.id,
            productId: item.productId,
            productName: item.productName,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            lineTotal: item.lineTotal,
            sellerName: 'Platform',
          },
        });
        subOrderItemsCreated += 1;
      }
    });
  }

  await assertBackfillConsistent(prisma);

  return {
    ordersProcessed: orders.length,
    subOrdersCreated,
    subOrderItemsCreated,
  };
}

/** Row-count parity checks (throw on mismatch). */
async function assertBackfillConsistent(prisma: PrismaClient): Promise<void> {
  const [orderCount, subOrderCount, orderItemCount, subOrderItemCount] =
    await Promise.all([
      prisma.order.count(),
      prisma.subOrder.count(),
      prisma.orderItem.count(),
      prisma.subOrderItem.count(),
    ]);

  if (orderCount !== subOrderCount) {
    throw new Error(
      `Backfill validation failed: count(Order)=${orderCount} != count(SubOrder)=${subOrderCount}`,
    );
  }
  if (orderItemCount !== subOrderItemCount) {
    throw new Error(
      `Backfill validation failed: count(OrderItem)=${orderItemCount} != count(SubOrderItem)=${subOrderItemCount}`,
    );
  }
}
```

*Note on the count-parity assert:* it compares total `Order`↔`SubOrder` and `OrderItem`↔`SubOrderItem` counts. Because S1 gives exactly one SubOrder per Order and copies items 1:1, equality holds after a full backfill. (Per-order `grandTotal` parity is verified live in Task 3 Step 4; the unit test covers the count asserts.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npm test -- suborder-backfill.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/src/orders/suborder-backfill.ts apps/api/src/orders/suborder-backfill.spec.ts
git commit -m "feat(order-split): idempotent backfillSubOrders core + tests (C3 logic)"
```

---

### Task 3: Backfill script wrapper + live verification

**Files:**
- Create: `apps/api/scripts/backfill-suborders.ts`

**Interfaces:**
- Consumes: `backfillSubOrders`, `BackfillResult` from `../src/orders/suborder-backfill`.

- [ ] **Step 1: Write the standalone script wrapper**

Create `apps/api/scripts/backfill-suborders.ts` (mirror `backfill-rating-aggregates.ts` exactly — same client construction + `main()`/`.catch`/`.finally` shape):

```ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { backfillSubOrders } from '../src/orders/suborder-backfill';

const adapter = new PrismaPg(process.env.DATABASE_URL as string);
const prisma = new PrismaClient({ adapter });

/**
 * Standalone maintenance script: backfill one Platform-Seller SubOrder (+items)
 * per existing Order. Idempotent — safe to re-run. Aborts (non-zero exit) if
 * the platform seller is missing or a validation assert fails.
 */
async function main(): Promise<void> {
  const result = await backfillSubOrders(prisma);
  console.log(
    `Backfill complete: processed ${result.ordersProcessed} order(s), ` +
      `created ${result.subOrdersCreated} SubOrder(s) + ` +
      `${result.subOrderItemsCreated} SubOrderItem(s). Validation passed.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Verify the full suite + typecheck (regression proof — zero behavior change)**

Run: `cd apps/api && npm test`
Expected: full suite green — all existing order/inventory/etc. tests pass **unchanged** plus the 5 new backfill tests. (No request-path behavior changed.)

Run: `npx tsc --noEmit`
Expected: only the 3 known pre-existing M2/M3 spec errors — **0 new**.

- [ ] **Step 3: Apply the migration to `ecom_dev` (additive, no reset)**

Run: `cd apps/api && npx prisma migrate deploy`
Expected: applies `20260713120000_add_suborder` and reports it as applied; **does not reset** the DB; any sibling migrations already applied stay applied. If it reports the DB is up to date after applying, good.

*(If `migrate deploy` reports drift from a sibling branch's migration, do NOT reset — stop and report; per the `shared-ecom-dev-cross-branch-drift` memory this is expected cross-branch and is handled by deploy, not reset.)*

- [ ] **Step 4: Run the backfill live + verify + prove idempotency**

Run: `cd apps/api && npx ts-node scripts/backfill-suborders.ts`  (the repo runs TS scripts with `ts-node` — see `prisma.config.ts` seed: `ts-node prisma/seed.ts`)
Expected: prints "Backfill complete: processed N order(s), created N SubOrder(s) + M SubOrderItem(s). Validation passed." with no thrown error.

Then verify per-order totals parity + counts directly (via `npx prisma studio` or a quick psql/query):
Expected: `SELECT count(*) FROM "Order"` == `SELECT count(DISTINCT "orderId") FROM "SubOrder"`; `count(OrderItem) == count(SubOrderItem)`; spot-check a few `Order.grandTotal == SubOrder.grandTotal`.

Run the script **again**: `npx ts-node scripts/backfill-suborders.ts`
Expected: "processed 0 order(s), created 0 SubOrder(s)..." — idempotency proven (no duplicate SubOrders).

- [ ] **Step 5: Confirm zero behavior change on existing order endpoints**

Boot the API (`npm run start:dev`), confirm fresh route mapping in the log, then spot-check with the actual running server (no SubOrder read path exists yet — this proves the app still works):
- `GET /orders` (as a customer) returns the same shape as before.
- Placing an order + a status update still behave exactly as today.
Expected: unchanged behavior; no error referencing SubOrder.

- [ ] **Step 6: Commit**

```bash
cd /Users/sotsys033/Desktop/HITESH_CLAUDE/13jun_sat
git add apps/api/scripts/backfill-suborders.ts
git commit -m "feat(order-split): standalone backfill-suborders script (C3) + live-verified"
```

---

## Final Verification (before declaring the slice done — RULE.md §5)

Not a code task — a gate after Task 3.

- [ ] `npm test` (API) green incl. the 5 new backfill tests; `npx tsc --noEmit` 0 new errors.
- [ ] `migrate diff` (Task 1 Step 4) clean; `prisma generate` OK.
- [ ] Migration applied to `ecom_dev` via `migrate deploy` (additive, no reset, siblings intact).
- [ ] Backfill ran green; 3 validation checks pass (Order↔SubOrder count, OrderItem↔SubOrderItem count, grandTotal parity); **re-run created 0** (idempotent).
- [ ] Existing order endpoints behave unchanged (no SubOrder read path yet).
- [ ] Update `docs/IMPLEMENTATION_PLAN.md`: mark M5 🟡 In Progress + M5a S1 ✅ with a one-line summary.
- [ ] STOP and ask the user to verify (RULE.md §1). Push only when asked.

## Self-Review Notes (author)

- **Spec coverage:** C1 enum+tables (Task 1), C2 `InventoryMovement.subOrderId` (Task 1), C3 idempotent backfill + validation (Tasks 2+3), file-diff+`migrate deploy` (Task 1 Step 4 + Task 3 Step 3), deferred relations (Task 1 adds none of shipments/returns/payout), `OrderItem` kept (no drop anywhere), zero-behavior-change regression proof (Task 3 Steps 2+5), live idempotency (Task 3 Step 4). All covered.
- **Type consistency:** `backfillSubOrders(prisma): Promise<BackfillResult>` and `BackfillResult { ordersProcessed, subOrdersCreated, subOrderItemsCreated }` defined in Task 2, consumed unchanged by Task 3. Model/field names match Task 1's schema exactly (`sellerName`, `shipLine2?`, the 5 money fields).
- **No placeholders:** every code + command step is concrete.
- **Enum type mismatch handled:** `OrderStatus` → `SubOrderStatus` are distinct Prisma enum types with identical values; Task 2 casts by value (documented inline) so `tsc` passes.
- **Script runner resolved:** `ts-node` (per `prisma.config.ts`), not `tsx`.
