# M2 Seller System — Slice 5: Seller Inventory API + Owning-Seller Low-Stock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the seller-facing inventory API — a `SellerInventoryController` at `/seller/inventory` (stock list, per-product stock detail, post manual movement), gated to ACTIVE sellers and scoped to the acting seller — reusing the slice-2 actor-aware `InventoryService`; and extend the low-stock domain event so the alert ALSO notifies the owning seller (not just the admin/staff queue).

**Architecture:** Mirror slice 3's seller-surface pattern. A new `SellerInventoryController` at `@Controller('seller/inventory')` with class-level `@Roles(Role.SELLER)` + `@UseGuards(SellerApprovedGuard)`, reading `@CurrentSeller()` and delegating to the existing `InventoryService.listStock(query, actor)` / `getStockItem(productId, actor)` / `adjust(actor, productId, dto)` (all already seller-scoped from slice 2, 404 on cross-tenant). Separately, add `sellerId` to `LowStockEvent` (the inventory service already has the item's `sellerId` at emit time) so `NotificationsService.recordLowStock` can write a second, seller-targeted notification alongside the existing admin one.

**Tech Stack:** NestJS + TypeScript (strict), Prisma 7, `@nestjs/event-emitter` (existing low-stock bus), Jest + Supertest. Reuses `SellerApprovedGuard`, `@CurrentSeller`, `ScopeActor` (slices 2–3).

## Global Constraints

- Seller-only surface: routes on `SellerInventoryController` (`@Roles(SELLER)` + `@UseGuards(SellerApprovedGuard)`); every query scoped to `@CurrentSeller()`'s seller. Admin's existing `InventoryController` (`/inventory`, `@Roles(ADMIN, INVENTORY_MANAGER)`) is UNCHANGED.
- Cross-tenant → 404 (slice-2 scoping in `InventoryService` via `findFirst({ productId, ...buildSellerScope(actor) })`).
- Reuse, don't reinvent: no new inventory business logic — the controller delegates to the existing actor-aware service methods. Manual movements reuse `CreateMovementDto` (ADDITION/DEDUCTION/ADJUSTMENT).
- Notifications fire on domain events, not inline (root CLAUDE.md): the seller low-stock notification is added in the event→listener→`recordLowStock` path, not in the inventory request handler.
- Low-stock event/listener must keep the existing admin (`userId: null`) notification AND add the owning-seller one; a failed seller-notification write must not lose the admin alert (and vice versa) — the listener already wraps in try/catch + logs.
- Strict TypeScript, no `any`. Verify with `npx tsc -p tsconfig.build.json --noEmit` (0 errors) + real boot — not `npm run build` exit code (memory: api-nest-build-swallows-tsc-errors).
- The `.claude/worktrees/improvment-UI` worktree is an ACTIVE other-agent worktree — ignore in stray checks, never touch.
- No `git push` without explicit permission (RULE.md §3). Branch: `feat/seller-system` (in place).

## File Structure

- `apps/api/src/inventory/seller-inventory.controller.ts` (new) — `@Controller('seller/inventory')`, 3 routes delegating to `InventoryService` with the seller actor.
- `apps/api/src/inventory/seller-inventory.controller.spec.ts` (new) — unit tests: each handler passes the seller actor (built from `@CurrentSeller()`).
- `apps/api/src/inventory/inventory.module.ts` (modify) — register `SellerInventoryController`; ensure `SellerApprovedGuard` resolvable (provide it, like `products.module.ts` did in slice 3).
- `apps/api/src/inventory/inventory.events.ts` (modify) — add `sellerId: string` to `LowStockEvent`.
- `apps/api/src/inventory/inventory.service.ts` (modify) — thread the item's `sellerId` into `lowStockCrossing`/`emitIfCrossedLow` so the emitted event carries it.
- `apps/api/src/inventory/inventory.service.spec.ts` (modify) — update low-stock emit assertions to include `sellerId`.
- `apps/api/src/notifications/notifications.service.ts` (modify) — `recordLowStock` writes the existing admin notification AND a seller-targeted one (resolve `Seller.userId` from `event.sellerId`).
- `apps/api/src/notifications/notifications.service.spec.ts` (modify) — assert both notifications written; seller lookup by `sellerId`.
- `apps/api/test/seller-inventory.e2e-spec.ts` (new) — e2e: seller sees own stock, cross-tenant 404, non-seller 403, posts a movement to own product; (optional) low-stock crossing writes a seller-targeted notification.

## Decisions locked in brainstorming

- **Route surface:** dedicated `SellerInventoryController` at `/seller/inventory` (mirrors slice-3's `/seller/products`). Admin `/inventory` unchanged.
- **Low-stock seller targeting:** add `sellerId` to `LowStockEvent`; `recordLowStock` keeps the admin notification (`userId: null`) AND writes a second seller-targeted one (resolve `Seller.userId` from `sellerId`). One event → two notifications.
- **No new inventory logic:** delegate to the slice-2 actor-aware `InventoryService`.

---

### Task 1: SellerInventoryController (`/seller/inventory`) + module wiring

**Files:**
- Create: `apps/api/src/inventory/seller-inventory.controller.ts`
- Create: `apps/api/src/inventory/seller-inventory.controller.spec.ts`
- Modify: `apps/api/src/inventory/inventory.module.ts`

**Interfaces:**
- Consumes: `InventoryService.listStock(query, actor)`, `getStockItem(productId, actor)`, `adjust(actor, productId, dto)` (slice 2); `SellerApprovedGuard`, `@CurrentSeller()`, `ScopeActor`, `CreateMovementDto`, `ListStockDto`.
- Produces: `GET /seller/inventory` (list), `GET /seller/inventory/:productId` (detail + movements), `POST /seller/inventory/:productId/movements` (post manual movement, 204) — all ACTIVE-seller-only, scoped to the acting seller.

- [ ] **Step 1: Write the controller spec**

Create `apps/api/src/inventory/seller-inventory.controller.spec.ts` (mirror `seller-products.controller.spec.ts`):

```ts
import { Role } from '@prisma/client';
import { SellerInventoryController } from './seller-inventory.controller';
import { ListStockDto } from './dto/list-stock.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { MovementType } from '@prisma/client';

const SELLER_ID = 'seller-a';
const actorFor = (sellerId: string) => ({ role: Role.SELLER, sellerId });

const build = () => {
  const inventory = {
    listStock: jest.fn(),
    getStockItem: jest.fn(),
    adjust: jest.fn(),
  };
  const ctrl = new SellerInventoryController(inventory as never);
  return { ctrl, inventory };
};

describe('SellerInventoryController', () => {
  it('listStock passes a seller-scoped actor', async () => {
    const { ctrl, inventory } = build();
    const query = {} as ListStockDto;
    await ctrl.listStock(SELLER_ID, query);
    expect(inventory.listStock).toHaveBeenCalledWith(query, actorFor(SELLER_ID));
  });

  it('getStockItem passes a seller-scoped actor', async () => {
    const { ctrl, inventory } = build();
    await ctrl.getStockItem(SELLER_ID, 'p1');
    expect(inventory.getStockItem).toHaveBeenCalledWith('p1', actorFor(SELLER_ID));
  });

  it('createMovement passes a merged actor (user sub + guard sellerId), productId, and dto', async () => {
    const { ctrl, inventory } = build();
    const user = { sub: 'u-1', email: 'a@b.c', role: Role.SELLER };
    const dto: CreateMovementDto = {
      type: MovementType.ADDITION,
      quantity: 5,
      reason: 'restock',
    };
    await ctrl.createMovement(user as never, SELLER_ID, 'p1', dto);
    // audit needs sub (from @CurrentUser), scope needs sellerId (from @CurrentSeller)
    expect(inventory.adjust).toHaveBeenCalledWith(
      { ...user, sellerId: SELLER_ID },
      'p1',
      dto,
    );
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd apps/api && npm test -- seller-inventory.controller`
Expected: FAIL — `Cannot find module './seller-inventory.controller'`.

- [ ] **Step 3: Implement the controller**

Create `apps/api/src/inventory/seller-inventory.controller.ts`. Note `adjust`'s signature is `adjust(actor, productId, dto)` and expects an `AccessTokenPayload`-ish actor; `{ role: SELLER, sellerId }` is a valid `ScopeActor`, and `adjust` types its first param — confirm it accepts a `ScopeActor` (it currently types `actor: AccessTokenPayload`). Since the seller controller only has `sellerId` (not the full token payload), widen `adjust`'s parameter type to `ScopeActor` (it only uses `actor` for scoping via `buildSellerScope`, not for `sub`/`email`) OR pass a `ScopeActor`. Verify what `adjust` reads from `actor`:

```ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { ListStockDto } from './dto/list-stock.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { SellerApprovedGuard } from '../sellers/guards/seller-approved.guard';
import { CurrentSeller } from '../auth/decorators/current-seller.decorator';
import { ScopeActor } from '../products/seller-scope';

/**
 * Seller-facing inventory. Every route is scoped to the acting seller (stock,
 * detail, and manual movements only touch the seller's own items; cross-tenant
 * access 404s via the service-layer scope). ACTIVE-seller status is enforced
 * DB-side by SellerApprovedGuard, which attaches the sellerId read by
 * @CurrentSeller(). Admin/inventory-manager use the separate InventoryController.
 */
@Roles(Role.SELLER)
@UseGuards(SellerApprovedGuard)
@Controller('seller/inventory')
export class SellerInventoryController {
  constructor(private readonly inventory: InventoryService) {}

  private actor(sellerId: string): ScopeActor {
    return { role: Role.SELLER, sellerId };
  }

  @Get()
  listStock(@CurrentSeller() sellerId: string, @Query() query: ListStockDto) {
    return this.inventory.listStock(query, this.actor(sellerId));
  }

  @Get(':productId')
  getStockItem(
    @CurrentSeller() sellerId: string,
    @Param('productId') productId: string,
  ) {
    return this.inventory.getStockItem(productId, this.actor(sellerId));
  }

  @Post(':productId/movements')
  @HttpCode(HttpStatus.NO_CONTENT)
  async createMovement(
    @CurrentSeller() sellerId: string,
    @Param('productId') productId: string,
    @Body() dto: CreateMovementDto,
  ): Promise<void> {
    await this.inventory.adjust(this.actor(sellerId), productId, dto);
  }
}
```

- [ ] **Step 4: `createMovement` must pass an actor carrying BOTH `sub` and `sellerId` (RESOLVED by inspection)**

Verified facts about the current `adjust(actor, productId, input)` (`inventory.service.ts:234`):
- It calls `requireItem(productId, actor)` → `buildSellerScope(actor)` → for a SELLER actor this reads `actor.sellerId` (so the actor MUST carry the guard-attached `sellerId`).
- It calls `applyWithAudit(actor, ...)` which reads **`actor.sub`** for the audit log's `actorId` (`inventory.service.ts` ~`actorId: actor.sub`). So the actor MUST also carry the real user id.

Therefore the seller `createMovement` actor needs `{ sub: <userId>, role: SELLER, sellerId: <guard sellerId>, email }` — `sub` for audit, `sellerId` for scope. The seller controller has the user via `@CurrentUser()` (gives `sub`, `email`, `role`) and the seller via `@CurrentSeller()` (gives `sellerId`). Merge them.

Change `adjust`'s param type to carry the optional sellerId. Define a small type and use it:

In `inventory.service.ts`, change the `adjust` signature from `actor: AccessTokenPayload` to:

```ts
  async adjust(
    actor: AccessTokenPayload & { sellerId?: string },
    productId: string,
    input: { type: ManualMovementType; quantity: number; reason: string },
  ): Promise<void> {
```

`AccessTokenPayload & { sellerId?: string }` is assignable from the admin path (`@CurrentUser()` payload, `sellerId` undefined → unscoped, audit uses its `sub`) AND from the seller path (the merged actor below). `buildSellerScope` reads `role`+`sellerId`; `applyWithAudit` reads `sub` — both satisfied. The admin `InventoryController.createMovement` (passes `@CurrentUser() user`) is unaffected (sellerId just undefined).

In the seller controller's `createMovement`, take BOTH decorators and merge:

```ts
  @Post(':productId/movements')
  @HttpCode(HttpStatus.NO_CONTENT)
  async createMovement(
    @CurrentUser() user: AccessTokenPayload,
    @CurrentSeller() sellerId: string,
    @Param('productId') productId: string,
    @Body() dto: CreateMovementDto,
  ): Promise<void> {
    await this.inventory.adjust({ ...user, sellerId }, productId, dto);
  }
```

(Import `CurrentUser` from `../auth/decorators/current-user.decorator` and `AccessTokenPayload` (type) from `../auth/auth-tokens` in the seller controller.) The `listStock`/`getStockItem` handlers only need scoping, so they keep using just `@CurrentSeller()` + the `this.actor(sellerId)` `ScopeActor` helper. Only `createMovement` needs the merged actor (because audit needs `sub`).

Report: confirm `adjust` was widened to `AccessTokenPayload & { sellerId?: string }`, that the admin createMovement still compiles unchanged, and that the seller createMovement merges `@CurrentUser()` + `@CurrentSeller()`.

- [ ] **Step 5: Register controller + guard in the module**

In `apps/api/src/inventory/inventory.module.ts`, add `SellerInventoryController` to `controllers` and `SellerApprovedGuard` to `providers` (mirror slice-3's `products.module.ts`). Confirm `PrismaModule` is imported (the guard's dep).

- [ ] **Step 6: Run the controller spec — verify green**

Run: `cd apps/api && npm test -- seller-inventory.controller`
Expected: PASS (3 tests).

- [ ] **Step 7: tsc + full suite + lint**

Run: `cd apps/api && npx tsc -p tsconfig.build.json --noEmit && npm test && npm run lint`
Expected: 0 tsc errors; full suite green (was 358); lint clean.

- [ ] **Step 8: Boot smoke — routes mapped**

Run `npm run start:dev` (background); poll `localhost:5000/products` for 200; confirm `Mapped {/seller/inventory, GET}`, `{/seller/inventory/:productId, GET}`, `{/seller/inventory/:productId/movements, POST}` in the boot log; stop the server.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/inventory/seller-inventory.controller.ts apps/api/src/inventory/seller-inventory.controller.spec.ts apps/api/src/inventory/inventory.module.ts apps/api/src/inventory/inventory.service.ts apps/api/src/inventory/inventory.service.spec.ts 2>/dev/null
git commit -m "feat(m2): seller inventory API (/seller/inventory), scoped to the acting seller"
```

(Include `inventory.service.ts`/spec ONLY if Step 4 required widening `adjust`'s param type.)

---

### Task 2: Low-stock alert also notifies the owning seller

**Files:**
- Modify: `apps/api/src/inventory/inventory.events.ts`
- Modify: `apps/api/src/inventory/inventory.service.ts`
- Modify: `apps/api/src/inventory/inventory.service.spec.ts`
- Modify: `apps/api/src/notifications/notifications.service.ts`
- Modify: `apps/api/src/notifications/notifications.service.spec.ts`

**Interfaces:**
- Produces: `LowStockEvent` gains `sellerId: string`. `NotificationsService.recordLowStock(event)` writes TWO notifications: the existing admin one (`userId: null`) and a seller-targeted one (`userId` = `Seller.userId` resolved from `event.sellerId`). If the seller can't be resolved, log + still write the admin one (don't throw).

- [ ] **Step 1: Add sellerId to the event type + update emit (TDD: service spec first)**

In `apps/api/src/inventory/inventory.service.spec.ts`, find the existing low-stock emit assertions (search for `LOW_STOCK_EVENT` / `emit` / `toHaveBeenCalledWith` with `{ productId, available, threshold }`). Update them to expect `sellerId` too, e.g. the emitted payload `{ productId, available, threshold, sellerId }`. The `item()` test factory must provide a `sellerId` (it has one in the DB; ensure the mock item includes `sellerId: 'seller-x'` and the assertion expects it). This is the red step for the event change.

- [ ] **Step 2: Run — verify the emit assertions fail**

Run: `cd apps/api && npm test -- inventory.service`
Expected: FAIL — emitted event lacks `sellerId`.

- [ ] **Step 3: Add `sellerId` to `LowStockEvent`**

In `apps/api/src/inventory/inventory.events.ts`:

```ts
export interface LowStockEvent {
  productId: string;
  available: number;
  threshold: number;
  /** The seller that owns the product (for owning-seller notification). */
  sellerId: string;
}
```

- [ ] **Step 4: Thread `sellerId` through the emit path in `inventory.service.ts`**

`lowStockCrossing(item, newAvailable)` builds the event from `item`. Widen its `item` param type to include `sellerId: string` and include it in the returned event:

```ts
  private lowStockCrossing(
    item: { productId: string; available: number; lowStockThreshold: number; sellerId: string },
    newAvailable: number,
  ): LowStockEvent | null {
    const { productId, available: before, lowStockThreshold: threshold, sellerId } = item;
    if (before > threshold && newAvailable <= threshold) {
      return { productId, available: newAvailable, threshold, sellerId };
    }
    return null;
  }
```

Do the same for `emitIfCrossedLow`'s `item` param type. VERIFIED: `requireItem` uses `findFirst({ where: { productId, ...scope } })` with NO `select`, so it returns the full `InventoryItem` row — which carries `sellerId` (NOT NULL since slice 1). So the `item` passed to `emitIfCrossedLow` (from the `adjust` path, line 276/291) already has `sellerId` at runtime; this is purely a TYPE widening of the narrowed param types, no `select` change needed. Check the other emit sites too (the standalone reserve/release/deduct/restock paths ~lines 104–208 use `requireItem` with `SYSTEM_ACTOR`, and their `emitIfCrossedLow`/emit calls — ~lines 122–127, 488–495 — also operate on full rows; widen any narrowed `item` types they pass through so `sellerId` is present on the emitted event). If TypeScript flags a site where the `item` truly lacks `sellerId`, that's where to add it; otherwise it's type-only.

- [ ] **Step 5: Run — emit assertions pass**

Run: `cd apps/api && npm test -- inventory.service`
Expected: PASS.

- [ ] **Step 6: Write the notifications spec (two notifications)**

In `apps/api/src/notifications/notifications.service.spec.ts`, add/extend `recordLowStock` tests. The service's Prisma mock needs `notification.create` and `seller.findUnique`. Assert:

```ts
it('records BOTH an admin (userId:null) and an owning-seller low-stock notification', async () => {
  // arrange: seller.findUnique resolves { userId: 'owner-user' }
  prisma.seller.findUnique.mockResolvedValue({ userId: 'owner-user' });
  prisma.notification.create.mockResolvedValue({});

  await service.recordLowStock({
    productId: 'p1', available: 1, threshold: 5, sellerId: 'seller-9',
  });

  expect(prisma.seller.findUnique).toHaveBeenCalledWith({
    where: { id: 'seller-9' },
    select: { userId: true },
  });
  // admin notification (userId: null)
  expect(prisma.notification.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ userId: null, type: NotificationType.LOW_STOCK }) }),
  );
  // seller notification (userId: owner)
  expect(prisma.notification.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ userId: 'owner-user', type: NotificationType.LOW_STOCK }) }),
  );
  expect(prisma.notification.create).toHaveBeenCalledTimes(2);
});

it('still records the admin alert if the owning seller cannot be resolved', async () => {
  prisma.seller.findUnique.mockResolvedValue(null);
  prisma.notification.create.mockResolvedValue({});

  await service.recordLowStock({ productId: 'p1', available: 1, threshold: 5, sellerId: 'gone' });

  // admin alert still written; no seller alert
  expect(prisma.notification.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ userId: null }) }),
  );
  expect(prisma.notification.create).toHaveBeenCalledTimes(1);
});
```

(Match the existing spec's mock-construction style — read it first to see how `prisma` is mocked and whether `seller` is already on the mock.)

- [ ] **Step 7: Run — verify the notifications spec fails**

Run: `cd apps/api && npm test -- notifications.service`
Expected: FAIL — only one notification written; `seller.findUnique` not called.

- [ ] **Step 8: Implement the dual-write in `recordLowStock`**

In `apps/api/src/notifications/notifications.service.ts`:

```ts
  async recordLowStock(event: LowStockEvent): Promise<void> {
    const payload = event as unknown as Prisma.InputJsonValue;

    // Admin/staff queue (unchanged).
    await this.prisma.notification.create({
      data: { type: NotificationType.LOW_STOCK, userId: null, payload },
    });

    // Owning-seller alert: resolve the seller's user. If the seller is gone,
    // the admin alert above still stands — don't fail the whole write.
    const seller = await this.prisma.seller.findUnique({
      where: { id: event.sellerId },
      select: { userId: true },
    });
    if (seller) {
      await this.prisma.notification.create({
        data: { type: NotificationType.LOW_STOCK, userId: seller.userId, payload },
      });
    }
  }
```

- [ ] **Step 9: Run — verify the notifications spec passes**

Run: `cd apps/api && npm test -- notifications.service`
Expected: PASS.

- [ ] **Step 10: tsc + full suite + lint**

Run: `cd apps/api && npx tsc -p tsconfig.build.json --noEmit && npm test && npm run lint`
Expected: 0 tsc errors; full suite green; lint clean.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/inventory/inventory.events.ts apps/api/src/inventory/inventory.service.ts apps/api/src/inventory/inventory.service.spec.ts apps/api/src/notifications/notifications.service.ts apps/api/src/notifications/notifications.service.spec.ts
git commit -m "feat(m2): low-stock alert also notifies the owning seller"
```

---

### Task 3: e2e — seller inventory isolation + movement over HTTP

**Files:**
- Create: `apps/api/test/seller-inventory.e2e-spec.ts`

**Interfaces:**
- Consumes: the running app + an ACTIVE seller with at least one product+inventory item. Proves seller inventory access is scoped over HTTP.

- [ ] **Step 1: Read the existing seller-products e2e for the harness pattern**

Read `apps/api/test/seller-products.e2e-spec.ts` — reuse its seed+mint approach (Prisma-seeded ACTIVE sellers via DI `PrismaService`, tokens via `TokenService`, the replicated `ValidationPipe`, FK-ordered cleanup). The inventory e2e needs each test seller to OWN a product WITH an `InventoryItem` — create the product (with `sellerId`) + an `InventoryItem` (with `sellerId` + `available`/`lowStockThreshold`) directly via Prisma in `beforeAll`.

- [ ] **Step 2: Write the e2e spec**

Create `apps/api/test/seller-inventory.e2e-spec.ts`. Cover:

1. **Own stock list:** `GET /seller/inventory` as Seller A → 200, includes A's product's stock row; B's is absent (assert with `?pageSize=100` if the list paginates — check `ListStockDto`).
2. **Own stock detail:** `GET /seller/inventory/:productId` (A's product) as A → 200.
3. **Cross-tenant detail → 404:** `GET /seller/inventory/:productId` (A's product) as Seller B → 404 (not 403; B is a valid ACTIVE seller → service-layer scope).
4. **Post movement to own product:** `POST /seller/inventory/:productId/movements` as A with `{ type: 'ADDITION', quantity: 5, reason: 'restock' }` → 204; then `GET /seller/inventory/:productId` shows available increased by 5.
5. **Cross-tenant movement → 404:** `POST /seller/inventory/:productId/movements` (A's product) as Seller B → 404.
6. **Non-seller → 403, no token → 401.**
7. **(Optional) Owning-seller low-stock notification:** drive A's product available below its threshold via a DEDUCTION movement; assert a `LOW_STOCK` notification row exists with `userId` = A's user (query Prisma directly). Clean up the notification rows.

Use the test namespace + FK-ordered cleanup (delete InventoryMovements/InventoryItems → Products → Sellers → Users; and any notification rows created). Confirm the cleanup order respects FKs (InventoryMovement → InventoryItem → Product → Seller → User).

- [ ] **Step 3: Run the e2e suite**

Run: `cd apps/api && npm run test:e2e`
Expected: PASS — existing 23 + new seller-inventory cases. Seed first if needed.

- [ ] **Step 4: tsc + lint**

Run: `cd apps/api && npx tsc -p tsconfig.build.json --noEmit && npm run lint`
Expected: 0 tsc errors; lint clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/seller-inventory.e2e-spec.ts
git commit -m "test(m2): e2e seller inventory isolation (own stock, cross-tenant 404, movement)"
```

---

### Task 4: Slice verification gate + tracker

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md`

- [ ] **Step 1: Full slice gate**

From `apps/api`: `npm test` (full), `npm run test:e2e`, `npm run lint`, `npx tsc -p tsconfig.build.json --noEmit` (0 errors). From repo root: `git status --porcelain` (clean), `git worktree list` (the `improvment-UI` worktree is an EXPECTED active other-agent worktree — ignore, do not touch).
Expected: all green.

- [ ] **Step 2: HTTP smoke**

Boot the app. Confirm `/seller/inventory` routes mapped; no-token → 401; non-seller (admin token) → 403. (Authenticated scoped CRUD + the movement + low-stock seller notification are proven by the e2e.) Stop the server.

- [ ] **Step 3: Update tracker**

In `docs/IMPLEMENTATION_PLAN.md`, append to the M2 row: "slice 5 (seller inventory API /seller/inventory — scoped stock/detail/movements; low-stock alert now also notifies the owning seller) done — **M2 backend complete**; next: slice 6 admin seller-portal UI."

- [ ] **Step 4: Commit**

```bash
git add docs/IMPLEMENTATION_PLAN.md
git commit -m "docs(m2): mark slice 5 (seller inventory API) done"
```

- [ ] **Step 5: STOP and ask the user to verify (RULE.md §1)**

Summarize; note slice 5 completes the M2 BACKEND (slices 1–5), and slice 6 (admin seller-portal UI) is the remaining frontend slice. Do not push.

---

## Self-Review

**Spec coverage (against `2026-06-22-m2-seller-system-design.md` §Seller inventory + §Slice plan row 5):**
- Seller-scoped `GET /inventory`, `GET /inventory/:productId`, `POST /inventory/:productId/movements` → `SellerInventoryController` at `/seller/inventory` (Task 1). ✓
- `requireItem` pattern / 404 cross-tenant → inherited from slice 2 (`InventoryService` scoped methods); proven by Task 3 e2e cases 3, 5. ✓
- "low-stock now also notifies the owning seller" → Task 2 (sellerId on event + dual-write in recordLowStock). ✓
- Admin inventory flows unchanged → admin `InventoryController` untouched; Task 1 only adds a new controller. ✓

**Placeholder scan:** No TBD/TODO. Task 1 Step 4 is a genuine decision-with-criteria (does `adjust` read `actor.sub`?) the implementer resolves by reading the actual code — it gives both branches and the rule to pick. Task 3 enumerates e2e cases with expected status codes (the harness must be matched, per Step 1). Unit/controller/service/notification code is given in full.

**Type consistency:** `ScopeActor` (slice 1) used in the controller. `adjust`'s actor-param type is the one open type question (Task 1 Step 4) — resolved by inspection (widen to `ScopeActor` if only scoping is read; preserve `sub` if audit needs it). `LowStockEvent` gains `sellerId: string` (Task 2 Step 3), consumed by `recordLowStock` (Step 8) and asserted in both inventory + notifications specs. `CreateMovementDto`/`ListStockDto` reused unchanged.

**Dependency note:** none — slice 5 adds no dependencies. Reuses the event bus, guard, decorator, and DTOs already in place.

**Audit note:** if `adjust` writes an `AuditLog` keyed on `actor.sub` (it threads the actor for stock-adjustment audit per M1 slice 2), the seller `createMovement` must supply a real user id, not just `sellerId`. Task 1 Step 4 forces the implementer to check this and pick the correct option — flagged as the one subtlety of this slice.
