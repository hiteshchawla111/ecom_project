# M2 Seller System — Slice 2: Service-Layer Ownership Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the actor-aware ownership-scoping mechanism (ADR-008) at the products + inventory service layer — a pure `buildSellerScope` helper plus service methods that filter/force `sellerId` when the actor is a `SELLER`, returning 404 (not 403) on cross-tenant access — fully unit-tested including cross-tenant isolation, with admin behavior unchanged.

**Architecture:** A single pure function `buildSellerScope(actor)` returns a Prisma `where` fragment: `{ sellerId }` for sellers, `{}` for admin. Products and inventory services accept a `ScopeActor` (`{ role, sellerId? }`) and compose that fragment into their existing `where` builders. Cross-tenant misses fall through to the existing `NotFoundException`. The product **create** path forces `sellerId` to the actor's seller for sellers (admin keeps the Platform-Seller default from slice 1). Routes stay ADMIN-only this slice; `SellerApprovedGuard` attaching the real `sellerId` to requests is slice 3 — so controllers pass an admin actor for now and the seller path is proven by unit tests.

**Tech Stack:** NestJS + TypeScript (strict), Prisma 7, Jest. Existing patterns: `@CurrentUser() user: AccessTokenPayload` (already used in `inventory.controller.ts`), `Prisma.ProductWhereInput`/`Prisma.InventoryItemWhereInput` builders.

## Global Constraints

- Strict TypeScript, no `any`. (`apps/api/CLAUDE.md`)
- Authorization is the API's job; the role boundary is enforced server-side, never trusted from a client. (root `CLAUDE.md`)
- Cross-tenant resource access returns **404, not 403** — a seller must not be able to probe another seller's resource IDs. (design spec §Decisions.4)
- Service-layer scoping is the enforcement point (ADR-008): when `role === SELLER`, every seller-reachable query applies `where.sellerId = actor.sellerId`, and writes force it.
- Admin (`role === ADMIN`, and `INVENTORY_MANAGER` for inventory) is unscoped — cross-seller visibility unchanged.
- Existing M0/M1 behavior and all existing tests (328 unit + 5 e2e) must stay green; admin-only routes behave exactly as before. (RULE.md §5)
- `ScopeActor` is the minimal scoping shape: `{ role: Role; sellerId?: string }`. `AccessTokenPayload` (`{ sub, email, role }`) is assignable where a fuller actor is needed; the `sellerId` is supplied by the caller (guard-attached in slice 3, test-supplied now).
- No `git push` without explicit permission (RULE.md §3). Branch: `feat/seller-system` (in place).

## File Structure

- `apps/api/src/products/seller-scope.ts` (new) — `ScopeActor` type + pure `buildSellerScope(actor): { sellerId?: string }` helper. Lives under `products/` but is shared by inventory (imported across) — it is the single source of the scoping rule. (Co-located with its first consumer; if a third consumer appears later it can move to a shared dir — YAGNI for now.)
- `apps/api/src/products/seller-scope.spec.ts` (new) — unit tests for the pure helper.
- `apps/api/src/products/products.service.ts` (modify) — `list`, `findOne`, `update`, `archive`, `setActive`, `ensureExists`, `create` accept a `ScopeActor` and compose the scope; `create` forces seller `sellerId`.
- `apps/api/src/products/products.service.spec.ts` (modify) — add seller-scoping + cross-tenant isolation tests; update existing calls to pass an admin actor.
- `apps/api/src/products/products.controller.ts` (modify) — pass `@CurrentUser()` actor into the (still ADMIN-only) service calls.
- `apps/api/src/inventory/inventory.service.ts` (modify) — `listStock`, `getStockItem`, `requireItem`/`adjust` accept a `ScopeActor` and scope the lookup.
- `apps/api/src/inventory/inventory.service.spec.ts` (modify) — add seller-scoping + cross-tenant isolation tests; update existing calls.
- `apps/api/src/inventory/inventory.controller.ts` (modify) — pass `@CurrentUser()` actor into `listStock`/`getStockItem` (already passed to `adjust`).

---

### Task 1: Pure `buildSellerScope` helper + `ScopeActor` type

**Files:**
- Create: `apps/api/src/products/seller-scope.ts`
- Test: `apps/api/src/products/seller-scope.spec.ts`

**Interfaces:**
- Produces: `type ScopeActor = { role: Role; sellerId?: string }`; `function buildSellerScope(actor: ScopeActor): { sellerId?: string }` — returns `{ sellerId: actor.sellerId }` when `role === Role.SELLER`, else `{}`. Throws `ForbiddenException` if `role === SELLER` but `sellerId` is undefined (defensive: a seller actor with no resolved seller is a server-side wiring error, fail-closed).

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/products/seller-scope.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { buildSellerScope } from './seller-scope';

describe('buildSellerScope', () => {
  it('scopes a SELLER to their own sellerId', () => {
    expect(buildSellerScope({ role: Role.SELLER, sellerId: 's1' })).toEqual({
      sellerId: 's1',
    });
  });

  it('returns an empty (unscoped) fragment for ADMIN', () => {
    expect(buildSellerScope({ role: Role.ADMIN })).toEqual({});
  });

  it('returns an empty (unscoped) fragment for INVENTORY_MANAGER', () => {
    expect(buildSellerScope({ role: Role.INVENTORY_MANAGER })).toEqual({});
  });

  it('fails closed when a SELLER actor has no sellerId (wiring error)', () => {
    expect(() => buildSellerScope({ role: Role.SELLER })).toThrow(
      ForbiddenException,
    );
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd apps/api && npm test -- seller-scope`
Expected: FAIL — `Cannot find module './seller-scope'`.

- [ ] **Step 3: Implement the helper**

Create `apps/api/src/products/seller-scope.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

/** Minimal actor shape needed to scope a query to its owner. */
export interface ScopeActor {
  role: Role;
  /** The acting seller's id; required when role is SELLER, ignored otherwise. */
  sellerId?: string;
}

/**
 * Ownership-scoping rule (ADR-008). A SELLER is confined to their own rows;
 * ADMIN / INVENTORY_MANAGER are unscoped (cross-seller visibility). Returns a
 * Prisma `where` fragment to spread into a query's `where`.
 *
 * Fails closed: a SELLER actor with no resolved sellerId is a server-side
 * wiring error (the guard should have attached it), never a silent unscoped read.
 */
export function buildSellerScope(actor: ScopeActor): { sellerId?: string } {
  if (actor.role !== Role.SELLER) return {};
  if (!actor.sellerId) {
    throw new ForbiddenException('Seller context missing');
  }
  return { sellerId: actor.sellerId };
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `cd apps/api && npm test -- seller-scope`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint**

Run: `cd apps/api && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/products/seller-scope.ts apps/api/src/products/seller-scope.spec.ts
git commit -m "feat(m2): pure buildSellerScope helper + ScopeActor (ADR-008)"
```

---

### Task 2: Apply scoping in ProductsService (+ create forces seller ownership)

**Files:**
- Modify: `apps/api/src/products/products.service.ts`
- Modify: `apps/api/src/products/products.service.spec.ts`

**Interfaces:**
- Consumes: `buildSellerScope`, `ScopeActor` from Task 1; `resolvePlatformSellerId` (slice 1, `./platform-seller`).
- Produces (new signatures — all gain a trailing `actor: ScopeActor`):
  - `list(query: ListProductsDto, actor: ScopeActor)`
  - `findOne(id: string, actor: ScopeActor)`
  - `create(dto: CreateProductDto, actor: ScopeActor)` — seller → `sellerId = actor.sellerId`; non-seller → Platform Seller (unchanged slice-1 default).
  - `update(id: string, dto: UpdateProductDto, actor: ScopeActor)`
  - `archive(id: string, actor: ScopeActor)`
  - `setActive(id: string, active: boolean, actor: ScopeActor)`
  - private `ensureExists(id: string, actor: ScopeActor)` — scoped existence check.

- [ ] **Step 1: Write the failing tests (seller scoping + cross-tenant 404)**

In `apps/api/src/products/products.service.spec.ts`, add at the top a reusable actor + update `makePrisma` is already fine. Add a new describe block:

```ts
import { Role } from '@prisma/client';
// ...existing imports...

const ADMIN: import('./seller-scope').ScopeActor = { role: Role.ADMIN };
const SELLER_A: import('./seller-scope').ScopeActor = {
  role: Role.SELLER,
  sellerId: 'seller-a',
};

describe('ownership scoping', () => {
  it('list scopes a SELLER to their own products', async () => {
    const { svc, prisma } = build();
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    await svc.list({} as never, SELLER_A);

    const [findArgs] = prisma.product.findMany.mock.calls as Array<
      [{ where: { sellerId?: string } }]
    >;
    expect(findArgs[0].where.sellerId).toBe('seller-a');
  });

  it('list does not scope an ADMIN', async () => {
    const { svc, prisma } = build();
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    await svc.list({} as never, ADMIN);

    const [findArgs] = prisma.product.findMany.mock.calls as Array<
      [{ where: { sellerId?: string } }]
    >;
    expect(findArgs[0].where.sellerId).toBeUndefined();
  });

  it('findOne 404s when the product belongs to another seller (cross-tenant)', async () => {
    const { svc, prisma } = build();
    prisma.product.findFirst.mockResolvedValue(null); // scoped query misses

    await expect(svc.findOne('p-of-seller-b', SELLER_A)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const [findArgs] = prisma.product.findFirst.mock.calls as Array<
      [{ where: { sellerId?: string } }]
    >;
    expect(findArgs[0].where.sellerId).toBe('seller-a');
  });

  it('create forces a SELLER product to be owned by the acting seller', async () => {
    const { svc, prisma } = build();
    prisma.product.create.mockResolvedValue({ id: 'p1', ...baseCreate });

    await svc.create(baseCreate, SELLER_A);

    const [createCall] = prisma.product.create.mock.calls as Array<
      [{ data: { sellerId?: string } }]
    >;
    expect(createCall[0].data.sellerId).toBe('seller-a');
    // platform-seller resolver must NOT be consulted for a seller actor
    expect(prisma.seller.findFirstOrThrow).not.toHaveBeenCalled();
  });
});
```

Also update the EXISTING create tests (the slice-1 ones) to pass `ADMIN` as the new second arg, e.g. `await svc.create(baseCreate, ADMIN);` and the existing `findOne`/`list`/`update` calls likewise. (The existing "sets a sellerId" test from slice 1 passes `ADMIN`, so it still routes through `resolvePlatformSellerId` and asserts `expect.any(String)`.)

- [ ] **Step 2: Run the tests — verify they fail**

Run: `cd apps/api && npm test -- products.service`
Expected: FAIL — `create`/`list`/`findOne` don't yet accept an actor / don't scope (TypeScript arity errors and/or assertion failures).

- [ ] **Step 3: Implement scoping in `products.service.ts`**

Add the import:

```ts
import { buildSellerScope, ScopeActor } from './seller-scope';
```

Change `create` to branch the owner on the actor:

```ts
  async create(dto: CreateProductDto, actor: ScopeActor): Promise<Product> {
    const sellerId =
      actor.role === Role.SELLER && actor.sellerId
        ? actor.sellerId
        : await resolvePlatformSellerId(this.prisma);
    try {
      return await this.prisma.product.create({
        data: {
          name: dto.name,
          sku: dto.sku,
          description: dto.description,
          price: dto.price,
          salePrice: dto.salePrice,
          brand: dto.brand,
          categoryId: dto.categoryId,
          status: dto.status,
          sellerId,
        },
      });
    } catch (err) {
      throw this.mapWriteError(err);
    }
  }
```

(Add `import { Role } from '@prisma/client';` to the existing `@prisma/client` import line if not present — it currently imports `Prisma, Product, ProductStatus`.)

`findOne` — scope the lookup:

```ts
  async findOne(id: string, actor: ScopeActor): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null, ...buildSellerScope(actor) },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }
```

`list` — fold the scope into `buildWhere`. Change `list` to pass the actor and `buildWhere` to accept it:

```ts
  async list(
    query: ListProductsDto,
    actor: ScopeActor,
  ): Promise<Paginated<Product>> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const where = this.buildWhere(query, actor);
    const orderBy = this.buildOrderBy(query);

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: PRODUCT_INCLUDE,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }
```

And in `buildWhere`:

```ts
  private buildWhere(
    query: ListProductsDto,
    actor: ScopeActor,
  ): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...buildSellerScope(actor),
    };
    // ...rest unchanged (search OR, categoryId, status, price range)...
    return where;
  }
```

`ensureExists` — scope it, and thread the actor through `update`/`archive`/`setActive`:

```ts
  async update(id: string, dto: UpdateProductDto, actor: ScopeActor): Promise<Product> {
    await this.ensureExists(id, actor);
    // ...unchanged update body...
  }

  async archive(id: string, actor: ScopeActor): Promise<Product> {
    await this.ensureExists(id, actor);
    // ...unchanged...
  }

  async setActive(id: string, active: boolean, actor: ScopeActor): Promise<Product> {
    await this.ensureExists(id, actor);
    // ...unchanged...
  }

  private async ensureExists(id: string, actor: ScopeActor): Promise<void> {
    const found = await this.prisma.product.findFirst({
      where: { id, deletedAt: null, ...buildSellerScope(actor) },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Product not found');
  }
```

Note: `update`/`archive`/`setActive` still call `prisma.product.update({ where: { id } })` after the scoped `ensureExists` gate — the gate is what enforces ownership (a cross-tenant id 404s before the update runs). Do not change the `update` where-clause to a composite; `ensureExists` is the guard.

- [ ] **Step 4: Run the tests — verify they pass**

Run: `cd apps/api && npm test -- products.service`
Expected: PASS — new scoping tests + all existing product tests (now passing `ADMIN`).

- [ ] **Step 5: Lint**

Run: `cd apps/api && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/products/products.service.ts apps/api/src/products/products.service.spec.ts
git commit -m "feat(m2): scope ProductsService by seller ownership (ADR-008)"
```

---

### Task 3: Thread the actor through ProductsController

**Files:**
- Modify: `apps/api/src/products/products.controller.ts`
- Modify: `apps/api/src/products/products.controller.spec.ts` (if it exists — otherwise skip; check first)

**Interfaces:**
- Consumes: the new actor-accepting service signatures (Task 2).
- Produces: controller passes `@CurrentUser()` into mutating calls. Routes stay `@Roles(Role.ADMIN)` (no seller route yet — slice 3). Public reads (`list`, `findOne`) are unauthenticated, so they have NO `@CurrentUser`; they pass an explicit ADMIN-equivalent unscoped actor.

- [ ] **Step 1: Check whether a controller spec exists**

Run: `ls apps/api/src/products/products.controller.spec.ts 2>/dev/null && echo EXISTS || echo NONE`
If EXISTS, read it to learn its mocking pattern before editing; the steps below assume you update it to pass/expect the actor. If NONE, no controller test changes are needed (service tests cover the scoping logic).

- [ ] **Step 2: Update the controller to pass the actor**

In `apps/api/src/products/products.controller.ts`:

The public reads (`@Public() list`, `@Public() findOne`) have no authenticated user. They must remain unscoped (the storefront catalog is public). Pass a constant unscoped actor:

```ts
import { Role } from '@prisma/client';
import { ScopeActor } from './seller-scope';

const PUBLIC_READ_ACTOR: ScopeActor = { role: Role.ADMIN }; // unscoped — public catalog

  @Public()
  @Get()
  list(@Query() query: ListProductsDto) {
    return this.products.list(query, PUBLIC_READ_ACTOR);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.products.findOne(id, PUBLIC_READ_ACTOR);
  }
```

The ADMIN mutations gain `@CurrentUser()`:

```ts
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth-tokens';

  @Roles(Role.ADMIN)
  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateProductDto,
  ) {
    return this.products.create(dto, user);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(id, dto, user);
  }

  @Roles(Role.ADMIN)
  @HttpCode(200)
  @Post(':id/archive')
  archive(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.products.archive(id, user);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/active')
  setActive(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: SetActiveDto,
  ) {
    return this.products.setActive(id, dto.active, user);
  }
```

(`AccessTokenPayload` is `{ sub, email, role }` — assignable to `ScopeActor` since `ScopeActor` only needs `role` and optional `sellerId`. An admin's `sellerId` is undefined → unscoped. Correct.)

- [ ] **Step 3: Build to catch arity/type mismatches**

Run: `cd apps/api && npm run build`
Expected: clean — all call sites now match the new service signatures.

- [ ] **Step 4: Run the full product test set**

Run: `cd apps/api && npm test -- products`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `cd apps/api && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/products/products.controller.ts apps/api/src/products/products.controller.spec.ts 2>/dev/null
git commit -m "feat(m2): thread actor into ProductsController (reads stay public/unscoped)"
```

---

### Task 4: Apply scoping in InventoryService + thread the actor through its controller

**Files:**
- Modify: `apps/api/src/inventory/inventory.service.ts`
- Modify: `apps/api/src/inventory/inventory.service.spec.ts`
- Modify: `apps/api/src/inventory/inventory.controller.ts`

**Interfaces:**
- Consumes: `buildSellerScope`, `ScopeActor` (Task 1).
- Produces (new signatures):
  - `listStock(query: ListStockDto, actor: ScopeActor)`
  - `getStockItem(productId: string, actor: ScopeActor)`
  - `adjust(actor: AccessTokenPayload, productId: string, dto: CreateMovementDto)` — already takes `user`; reuse it as the scope actor (it is already `AccessTokenPayload`). Scope its internal item lookup.
  - private `requireItem(productId, actor, tx?)` — scoped lookup.

- [ ] **Step 1: Read the current inventory service scoping points**

Read `apps/api/src/inventory/inventory.service.ts` around lines 229 (`adjust`), 340 (`listStock`), 392 (`getStockItem`), 439 (`requireItem`). Note that `listStock` builds `let where: Prisma.InventoryItemWhereInput = {}` (line ~358), `getStockItem` and `requireItem` use `findUnique({ where: { productId } })`. Because `InventoryItem.productId` is `@unique`, a `findUnique({ productId })` cannot also filter by `sellerId`; the scoped versions must use `findFirst({ where: { productId, ...scope } })`.

- [ ] **Step 2: Write the failing tests**

In `apps/api/src/inventory/inventory.service.spec.ts`, add scoping tests. Use the existing `item()` factory and Prisma mock; add `seller-scope` actors:

```ts
import { Role } from '@prisma/client';
const INV_ADMIN = { role: Role.ADMIN } as const;
const INV_SELLER_A = { role: Role.SELLER, sellerId: 'seller-a' } as const;

describe('inventory ownership scoping', () => {
  it('listStock scopes a SELLER to their own stock', async () => {
    const { svc, prisma } = build(); // use the suite's existing builder
    // existing listStock uses prisma.$transaction wrapping findMany+count;
    // mock to capture the where passed to findMany (mirror the existing listStock test's mock shape)
    // ...arrange per the file's existing listStock test...
    await svc.listStock({} as never, INV_SELLER_A);
    // assert the findMany where.sellerId === 'seller-a'
  });

  it('getStockItem 404s for another seller’s product (cross-tenant)', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findFirst.mockResolvedValue(null);
    await expect(
      svc.getStockItem('p-of-seller-b', INV_SELLER_A),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getStockItem does not scope an ADMIN', async () => {
    const { svc, prisma } = build();
    prisma.inventoryItem.findFirst.mockResolvedValue(item());
    await svc.getStockItem('p1', INV_ADMIN);
    const [args] = prisma.inventoryItem.findFirst.mock.calls as Array<
      [{ where: { sellerId?: string } }]
    >;
    expect(args[0].where.sellerId).toBeUndefined();
  });
});
```

IMPORTANT for the implementer: the existing inventory spec mocks `inventoryItem.findUnique` for `getStockItem`/`requireItem`. Since you are switching those reads to `findFirst` (to allow the `sellerId` filter), you MUST update the existing tests' mocks from `findUnique` to `findFirst` where they target `getStockItem`/`requireItem`/`adjust`. Add `findFirst: jest.fn()` to the `inventoryItem` mock in `makePrisma`-equivalent builders (both the top-level prisma mock and the `tx` mock used by adjust). Keep `findUnique` on the mock if other paths still use it. Match each switched call's existing return-value setup.

- [ ] **Step 3: Run the tests — verify they fail**

Run: `cd apps/api && npm test -- inventory.service`
Expected: FAIL — arity errors (methods don't take an actor) and/or `findFirst` not defined on the mock.

- [ ] **Step 4: Implement scoping in `inventory.service.ts`**

Add: `import { buildSellerScope, ScopeActor } from '../products/seller-scope';`

`listStock` — accept actor, fold scope into the `where`:

```ts
  async listStock(
    query: ListStockDto,
    actor: ScopeActor,
  ): Promise<Paginated<StockRow>> {
    // ...existing setup...
    let where: Prisma.InventoryItemWhereInput = { ...buildSellerScope(actor) };
    // ...existing low-stock filter logic spreads onto `where`...
  }
```

`getStockItem` — switch `findUnique` → `findFirst` with scope:

```ts
  async getStockItem(
    productId: string,
    actor: ScopeActor,
  ): Promise<StockItemView> {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { productId, ...buildSellerScope(actor) },
      // ...existing include/select...
    });
    if (!item) throw new NotFoundException(/* existing message */);
    // ...rest unchanged...
  }
```

`requireItem` — accept actor, switch to `findFirst` scoped:

```ts
  private async requireItem(
    productId: string,
    actor: ScopeActor,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    const item = await db.inventoryItem.findFirst({
      where: { productId, ...buildSellerScope(actor) },
    });
    if (!item) throw new NotFoundException(/* existing message */);
    return item;
  }
```

`adjust(user, productId, dto)` — `user` is already `AccessTokenPayload`; pass it as the actor to `requireItem`:

```ts
    // inside adjust, where it currently calls requireItem(productId, tx):
    const item = await this.requireItem(productId, user, tx);
```

(If `adjust` currently calls `requireItem(productId)` without `user`, thread `user` in. `user` is the existing first param.)

Verify there are no other `requireItem(`/`getStockItem(` call sites missing the actor: `grep -n "requireItem(\|getStockItem(\|listStock(" src/inventory/inventory.service.ts`.

- [ ] **Step 5: Update the inventory controller to pass the actor**

In `apps/api/src/inventory/inventory.controller.ts` — `listStock`/`getStockItem` gain `@CurrentUser()` (the controller already imports it and uses it for `createMovement`):

```ts
  @Get()
  listStock(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListStockDto,
  ) {
    return this.inventory.listStock(query, user);
  }

  @Get(':productId')
  getStockItem(
    @CurrentUser() user: AccessTokenPayload,
    @Param('productId') productId: string,
  ) {
    return this.inventory.getStockItem(productId, user);
  }
```

(`createMovement` already passes `user` to `adjust` — no change beyond what Task-4 service edits require.)

- [ ] **Step 6: Run the tests — verify they pass**

Run: `cd apps/api && npm test -- inventory`
Expected: PASS — new scoping tests + all existing inventory tests (mocks switched to `findFirst` where needed).

- [ ] **Step 7: Build + full suite + lint**

Run: `cd apps/api && npm run build && npm test && npm run lint`
Expected: build clean; full suite green (was 328 + the new scoping tests); lint clean.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/inventory/inventory.service.ts apps/api/src/inventory/inventory.service.spec.ts apps/api/src/inventory/inventory.controller.ts
git commit -m "feat(m2): scope InventoryService by seller ownership (ADR-008)"
```

---

### Task 5: Slice verification gate + tracker note

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md` (M2 note: slice 2 done)

- [ ] **Step 1: Full slice gate**

Run from `apps/api`: `npm test` (full), `npm run test:e2e`, `npm run lint`, `npm run build`. Then from repo root: `git status --porcelain` (clean) and `git worktree list` (single worktree).
Expected: all green; tree clean; no stray worktree.

- [ ] **Step 2: HTTP smoke (admin path unchanged)**

Boot `npm run start:dev`. As ADMIN (login admin@example.com / Password123!): `GET /products` (200, cross-seller list as before), `GET /inventory` (200), create a product (201, owned by Platform Seller), then delete it. The seller path has no route yet (slice 3) — note in the smoke that seller scoping is unit-test-proven, not yet HTTP-reachable. Stop the server.

- [ ] **Step 3: Update tracker**

In `docs/IMPLEMENTATION_PLAN.md`, update the M2 row note: append "slice 2 (service-layer ownership scoping — buildSellerScope + products/inventory scoped, cross-tenant 404, admin unchanged; unit-tested) done; next: slice 3 seller product CRUD API + wire SellerApprovedGuard to attach sellerId."

- [ ] **Step 4: Commit**

```bash
git add docs/IMPLEMENTATION_PLAN.md
git commit -m "docs(m2): mark slice 2 (ownership scoping) done"
```

- [ ] **Step 5: STOP and ask the user to verify (RULE.md §1)**

Summarize changes, files, test counts, and the smoke result; note that seller routes/guard-attachment land in slice 3. Do not push.

---

## Self-Review

**Spec coverage (against `2026-06-22-m2-seller-system-design.md` §Ownership scoping pattern):**
- `buildSellerScope(actor)` pure helper → Task 1. ✓
- Products + inventory services compose it into existing `where` builders → Tasks 2, 4. ✓
- 404-on-miss via `findFirst({ id/productId, sellerId, deletedAt:null })` → Tasks 2, 4. ✓
- Writes force `sellerId` for sellers (create) → Task 2. ✓
- Admin unscoped, behavior unchanged → constant unscoped actor on public reads + admin actor has no sellerId → Tasks 2–4 + existing tests staying green. ✓
- Guard resolves+attaches `sellerId` → **explicitly deferred to slice 3** (design says guard is the resolution point, but no seller route consumes it until slice 3; this slice uses test-supplied/admin actors). Documented in Architecture + Task 3/5 notes. ✓
- `requireItem` pattern for inventory cross-tenant → Task 4. ✓

**Placeholder scan:** No TBD/TODO. The inventory spec test bodies (Task 4 Step 2) intentionally say "arrange per the file's existing listStock test" because the existing `listStock` mock shape (a `$transaction` wrapper) must be matched exactly and is too file-specific to reproduce blind — the implementer is told to read it in Step 1 and mirror it. This is a direct instruction to match existing code, not a vague placeholder; the assertion (`where.sellerId === 'seller-a'`) is concrete.

**Type consistency:** `ScopeActor = { role: Role; sellerId?: string }` (Task 1) consumed identically in Tasks 2–4. `AccessTokenPayload` (`{ sub, email, role }`) is assignable to `ScopeActor` (only `role` required) — relied on in Tasks 3, 4. All product service methods gain a trailing `actor: ScopeActor`; controller passes `@CurrentUser()` (mutations) or `PUBLIC_READ_ACTOR` (public reads). Inventory `getStockItem`/`requireItem` switch `findUnique`→`findFirst` (required to add the `sellerId` filter) — the plan flags the matching spec-mock change explicitly.

**Note on the `findUnique`→`findFirst` switch (inventory):** `InventoryItem.productId` is `@unique`, so `findUnique({ productId })` cannot carry a second filter. Switching to `findFirst({ productId, ...scope })` is necessary and behavior-preserving for admin (scope empty → same single row). Called out in Task 4 Step 1 and the spec-mock instruction so existing tests are updated, not silently broken.
