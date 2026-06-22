# M2 Seller System — Slice 3: Seller Product CRUD API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the seller-facing product API — a `SellerProductsController` at `/seller/products` (list/get/create/update/archive/activate) gated to ACTIVE sellers — by wiring `SellerApprovedGuard` to resolve and attach the acting `sellerId`, so the slice-2 ownership-scoping mechanism becomes reachable over HTTP. A seller sees and mutates only their own products; cross-tenant access 404s; admin keeps its existing cross-seller `/products` surface unchanged.

**Architecture:** Follow the M1 seller-surface convention (`@Controller('seller')` + `@Roles(Role.SELLER)`, mirroring `sellers.controller.ts`). `SellerApprovedGuard` (built in M1, currently status-only and attached nowhere) gains one responsibility: on an ACTIVE seller it sets `request.sellerId = seller.id`. A new `@CurrentSeller()` param decorator reads it (mirrors `@CurrentUser()`). The new `SellerProductsController` applies `@UseGuards(SellerApprovedGuard)` + `@Roles(Role.SELLER)`, reads `@CurrentSeller()`, and delegates to the **existing** `ProductsService` methods (already actor-aware from slice 2) passing `{ role: Role.SELLER, sellerId }`. No service logic changes — slice 2 already did the scoping.

**Tech Stack:** NestJS + TypeScript (strict), Prisma 7, Jest + Supertest (e2e). Global guards already in place: `JwtAuthGuard` + `RolesGuard` (APP_GUARDs); `SellerApprovedGuard` is a per-route `@UseGuards`.

## Global Constraints

- Authorization is the API's job, enforced server-side, never trusted from a client. (root `CLAUDE.md`)
- Seller route convention: `@Controller('seller/...')` + `@Roles(Role.SELLER)` (matches `sellers.controller.ts`); admin route convention: `@Controller('admin/...')` + class-level `@Roles(Role.ADMIN)`.
- DB-authoritative seller status (ADR-005): `SellerApprovedGuard` checks `Seller.status === ACTIVE` from the DB per request (token role can be ≤15min stale). A suspended/pending/deactivated/absent seller is blocked (403).
- Cross-tenant resource access → **404, not 403** (handled by slice-2 scoping in `ProductsService`).
- Strict TypeScript, no `any`. Existing `/products` (public reads + admin writes) and all existing tests stay green.
- The seller create-path owns the product (slice-2 `create` forces `sellerId = actor.sellerId` for a SELLER actor); per-seller SKU uniqueness (slice-1 `@@unique([sku, sellerId])`) means a seller reusing their own SKU → 409, two sellers may share a SKU.
- Verify build with `npx tsc -p tsconfig.build.json --noEmit` (0 errors) AND an actual dev-server boot — NOT just `npm run build`'s exit code, which swallows tsc errors (`seed.ts`/`prisma` is outside jest+eslint). (memory: api-nest-build-swallows-tsc-errors)
- No `git push` without explicit permission (RULE.md §3). Branch: `feat/seller-system` (in place).

## File Structure

- `apps/api/src/sellers/guards/seller-approved.guard.ts` (modify) — `select: { id, status }`; on ACTIVE set `request.sellerId = seller.id`.
- `apps/api/src/sellers/guards/seller-approved.guard.spec.ts` (modify) — update the two `toHaveBeenCalledWith` select assertions to `{ id: true, status: true }`; add a test asserting `request.sellerId` is set on ACTIVE.
- `apps/api/src/auth/decorators/current-seller.decorator.ts` (new) — `@CurrentSeller()` reads `request.sellerId` (throws if absent — defensive: only used behind the guard).
- `apps/api/src/auth/decorators/current-seller.decorator.spec.ts` (new) — unit test the extractor via a fake `ExecutionContext`.
- `apps/api/src/products/seller-products.controller.ts` (new) — `@Controller('seller/products')`, `@Roles(Role.SELLER)`, `@UseGuards(SellerApprovedGuard)`; list/get/create/update/archive/setActive delegating to `ProductsService` with `{ role: SELLER, sellerId }`.
- `apps/api/src/products/seller-products.controller.spec.ts` (new) — unit tests: each handler passes the seller actor to the service.
- `apps/api/src/products/products.module.ts` (modify) — register `SellerProductsController`; ensure `SellerApprovedGuard` is available (provide it or import the module that exports it).
- `apps/api/test/seller-products.e2e-spec.ts` (new) — e2e: ACTIVE seller CRUD + cross-tenant 404 + non-seller 403, against the real app.

## Decisions locked in brainstorming

- **`sellerId` exposure:** guard attaches `request.sellerId`; `@CurrentSeller()` param decorator reads it (mirrors `@CurrentUser()`).
- **Route surface:** dedicated `SellerProductsController` at `/seller/products` (M1 convention), NOT overloading the public/admin `/products` controller. Admin `/products` is unchanged.
- **No service changes:** `ProductsService` is already actor-aware (slice 2); slice 3 only routes seller requests into it.

---

### Task 1: Extend SellerApprovedGuard to attach `sellerId` + `@CurrentSeller()` decorator

**Files:**
- Modify: `apps/api/src/sellers/guards/seller-approved.guard.ts`
- Modify: `apps/api/src/sellers/guards/seller-approved.guard.spec.ts`
- Create: `apps/api/src/auth/decorators/current-seller.decorator.ts`
- Create: `apps/api/src/auth/decorators/current-seller.decorator.spec.ts`

**Interfaces:**
- Produces: `SellerApprovedGuard` now sets `request.sellerId: string` for an ACTIVE seller (ADMIN bypass leaves it unset). `@CurrentSeller()` param decorator returns `request.sellerId` (string), throwing `ForbiddenException('Seller context missing')` if absent.

- [ ] **Step 1: Update the guard spec — assert id is selected + sellerId attached**

In `apps/api/src/sellers/guards/seller-approved.guard.spec.ts`:

The `ctxWith` helper currently returns a fresh `{ user }` object each `getRequest()` call — to assert attachment, make it return a STABLE request object so a mutation is observable:

```ts
const ctxWith = (
  user: AccessTokenPayload | undefined,
): { ctx: ExecutionContext; req: { user?: AccessTokenPayload; sellerId?: string } } => {
  const req: { user?: AccessTokenPayload; sellerId?: string } = { user };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
};
```

Update every existing call: `const { ctx } = ctxWith({...})` then `guard.canActivate(ctx)`. Update `makePrisma` to allow an `id`:

```ts
const makePrisma = (
  result: { id?: string; status: SellerStatus } | null,
): jest.Mocked<Pick<PrismaService, 'seller'>> => ({
  seller: {
    findUnique: jest.fn().mockResolvedValue(result),
  } as unknown as PrismaService['seller'],
});
```

Update the two `toHaveBeenCalledWith` assertions from `select: { status: true }` to `select: { id: true, status: true }`. Then add a new test:

```ts
it('attaches request.sellerId for an ACTIVE seller', async () => {
  const prisma = makePrisma({ id: 'seller-99', status: SellerStatus.ACTIVE });
  const guard = new SellerApprovedGuard(prisma as unknown as PrismaService);
  const { ctx, req } = ctxWith({
    sub: 'seller-1',
    email: 'seller@test.com',
    role: Role.SELLER,
  });

  await expect(guard.canActivate(ctx)).resolves.toBe(true);
  expect(req.sellerId).toBe('seller-99');
});

it('does not attach sellerId for an ADMIN (bypass)', async () => {
  const prisma = makePrisma(null);
  const guard = new SellerApprovedGuard(prisma as unknown as PrismaService);
  const { ctx, req } = ctxWith({
    sub: 'admin-1',
    email: 'admin@test.com',
    role: Role.ADMIN,
  });

  await expect(guard.canActivate(ctx)).resolves.toBe(true);
  expect(req.sellerId).toBeUndefined();
});
```

- [ ] **Step 2: Run the guard spec — verify it fails**

Run: `cd apps/api && npm test -- seller-approved.guard`
Expected: FAIL — `select` assertions expect `id` (not yet selected) and `req.sellerId` is undefined (not yet attached).

- [ ] **Step 3: Implement the guard change**

In `apps/api/src/sellers/guards/seller-approved.guard.ts`, change the request type to be mutable, select `id`, and attach `sellerId`:

```ts
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AccessTokenPayload; sellerId?: string }>();
    const { user } = request;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // ADMIN bypasses the seller check — admins act cross-seller and need no seller row
    if (user.role === Role.ADMIN) {
      return true;
    }

    // DB-authoritative: check Seller.status, not the JWT role claim (can be up to 15 min stale)
    const seller = await this.prisma.seller.findUnique({
      where: { userId: user.sub },
      select: { id: true, status: true },
    });

    if (seller === null || seller.status !== SellerStatus.ACTIVE) {
      throw new ForbiddenException('Seller account is not active');
    }

    // Attach the resolved seller id for downstream scoping (@CurrentSeller()).
    request.sellerId = seller.id;
    return true;
  }
```

- [ ] **Step 4: Write the `@CurrentSeller()` decorator + its spec**

Create `apps/api/src/auth/decorators/current-seller.decorator.ts`:

```ts
import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Resolves the acting seller's id, set on the request by SellerApprovedGuard.
 * Only valid on routes guarded by SellerApprovedGuard with an ACTIVE seller;
 * throws if absent (a wiring error — never a silent unscoped value).
 */
export const CurrentSeller = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const { sellerId } = ctx
      .switchToHttp()
      .getRequest<{ sellerId?: string }>();
    if (!sellerId) {
      throw new ForbiddenException('Seller context missing');
    }
    return sellerId;
  },
);
```

Create `apps/api/src/auth/decorators/current-seller.decorator.spec.ts`. Param decorators are awkward to invoke directly; test the underlying factory by extracting it. Since `createParamDecorator` wraps the factory, test via a small re-export of the logic OR invoke the decorator's factory through the Nest test pattern. Use this self-contained approach — duplicate the extractor as a tested pure function is overkill; instead assert the decorator function exists and the request-reading contract via a fake context using the decorator's internal factory is not directly reachable, so test the behavior at the e2e layer (Task 3) and unit-test a tiny extractor helper:

Refactor the decorator to delegate to an exported pure function so it is unit-testable:

```ts
import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/** Pure extractor — unit-testable without Nest's decorator machinery. */
export function extractSellerId(req: { sellerId?: string }): string {
  if (!req.sellerId) {
    throw new ForbiddenException('Seller context missing');
  }
  return req.sellerId;
}

export const CurrentSeller = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string =>
    extractSellerId(ctx.switchToHttp().getRequest<{ sellerId?: string }>()),
);
```

Then the spec:

```ts
import { ForbiddenException } from '@nestjs/common';
import { extractSellerId } from './current-seller.decorator';

describe('extractSellerId', () => {
  it('returns the sellerId attached to the request', () => {
    expect(extractSellerId({ sellerId: 's1' })).toBe('s1');
  });

  it('throws when sellerId is missing (guard not applied / wiring error)', () => {
    expect(() => extractSellerId({})).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 5: Run the guard + decorator specs — verify green**

Run: `cd apps/api && npm test -- seller-approved.guard current-seller`
Expected: PASS — guard attaches sellerId, selects id; extractor returns/throws correctly.

- [ ] **Step 6: tsc + lint**

Run: `cd apps/api && npx tsc -p tsconfig.build.json --noEmit && npm run lint`
Expected: 0 tsc errors; lint clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/sellers/guards/seller-approved.guard.ts apps/api/src/sellers/guards/seller-approved.guard.spec.ts apps/api/src/auth/decorators/current-seller.decorator.ts apps/api/src/auth/decorators/current-seller.decorator.spec.ts
git commit -m "feat(m2): SellerApprovedGuard attaches sellerId + @CurrentSeller decorator"
```

---

### Task 2: SellerProductsController (`/seller/products`) + module wiring

**Files:**
- Create: `apps/api/src/products/seller-products.controller.ts`
- Create: `apps/api/src/products/seller-products.controller.spec.ts`
- Modify: `apps/api/src/products/products.module.ts`

**Interfaces:**
- Consumes: `ProductsService` (actor-aware methods from slice 2: `list(query, actor)`, `findOne(id, actor)`, `create(dto, actor)`, `update(id, dto, actor)`, `archive(id, actor)`, `setActive(id, active, actor)`); `SellerApprovedGuard`, `@CurrentSeller()`, `@Roles`, `ScopeActor`.
- Produces: routes `GET /seller/products`, `GET /seller/products/:id`, `POST /seller/products`, `PATCH /seller/products/:id`, `POST /seller/products/:id/archive`, `PATCH /seller/products/:id/active` — all ACTIVE-seller-only, scoped to the acting seller.

- [ ] **Step 1: Write the controller spec (each handler passes the seller actor)**

Create `apps/api/src/products/seller-products.controller.spec.ts`:

```ts
import { Role } from '@prisma/client';
import { SellerProductsController } from './seller-products.controller';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';

const SELLER_ID = 'seller-a';
const actorFor = (sellerId: string) => ({ role: Role.SELLER, sellerId });

const build = () => {
  const products = {
    list: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
    setActive: jest.fn(),
  };
  const ctrl = new SellerProductsController(products as never);
  return { ctrl, products };
};

describe('SellerProductsController', () => {
  it('list passes a seller-scoped actor', async () => {
    const { ctrl, products } = build();
    const query = {} as ListProductsDto;
    await ctrl.list(SELLER_ID, query);
    expect(products.list).toHaveBeenCalledWith(query, actorFor(SELLER_ID));
  });

  it('findOne passes a seller-scoped actor', async () => {
    const { ctrl, products } = build();
    await ctrl.findOne(SELLER_ID, 'p1');
    expect(products.findOne).toHaveBeenCalledWith('p1', actorFor(SELLER_ID));
  });

  it('create passes a seller-scoped actor', async () => {
    const { ctrl, products } = build();
    const dto = {} as CreateProductDto;
    await ctrl.create(SELLER_ID, dto);
    expect(products.create).toHaveBeenCalledWith(dto, actorFor(SELLER_ID));
  });

  it('update passes a seller-scoped actor', async () => {
    const { ctrl, products } = build();
    const dto = {} as UpdateProductDto;
    await ctrl.update(SELLER_ID, 'p1', dto);
    expect(products.update).toHaveBeenCalledWith('p1', dto, actorFor(SELLER_ID));
  });

  it('archive passes a seller-scoped actor', async () => {
    const { ctrl, products } = build();
    await ctrl.archive(SELLER_ID, 'p1');
    expect(products.archive).toHaveBeenCalledWith('p1', actorFor(SELLER_ID));
  });

  it('setActive passes a seller-scoped actor', async () => {
    const { ctrl, products } = build();
    await ctrl.setActive(SELLER_ID, 'p1', { active: false });
    expect(products.setActive).toHaveBeenCalledWith('p1', false, actorFor(SELLER_ID));
  });
});
```

- [ ] **Step 2: Run the spec — verify it fails**

Run: `cd apps/api && npm test -- seller-products.controller`
Expected: FAIL — `Cannot find module './seller-products.controller'`.

- [ ] **Step 3: Implement the controller**

Create `apps/api/src/products/seller-products.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { SetActiveDto } from './dto/set-active.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { SellerApprovedGuard } from '../sellers/guards/seller-approved.guard';
import { CurrentSeller } from '../auth/decorators/current-seller.decorator';
import { ScopeActor } from './seller-scope';

/**
 * Seller-facing product catalog. Every route is scoped to the acting seller:
 * a seller can only see/mutate their own products (cross-tenant access 404s via
 * the service-layer scope). ACTIVE-seller status is enforced DB-side by
 * SellerApprovedGuard, which also attaches the sellerId read by @CurrentSeller().
 * Admin keeps its separate cross-seller surface on ProductsController (/products).
 */
@Roles(Role.SELLER)
@UseGuards(SellerApprovedGuard)
@Controller('seller/products')
export class SellerProductsController {
  constructor(private readonly products: ProductsService) {}

  private actor(sellerId: string): ScopeActor {
    return { role: Role.SELLER, sellerId };
  }

  @Get()
  list(@CurrentSeller() sellerId: string, @Query() query: ListProductsDto) {
    return this.products.list(query, this.actor(sellerId));
  }

  @Get(':id')
  findOne(@CurrentSeller() sellerId: string, @Param('id') id: string) {
    return this.products.findOne(id, this.actor(sellerId));
  }

  @Post()
  create(
    @CurrentSeller() sellerId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.products.create(dto, this.actor(sellerId));
  }

  @Patch(':id')
  update(
    @CurrentSeller() sellerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(id, dto, this.actor(sellerId));
  }

  @HttpCode(200)
  @Post(':id/archive')
  archive(@CurrentSeller() sellerId: string, @Param('id') id: string) {
    return this.products.archive(id, this.actor(sellerId));
  }

  @Patch(':id/active')
  setActive(
    @CurrentSeller() sellerId: string,
    @Param('id') id: string,
    @Body() dto: SetActiveDto,
  ) {
    return this.products.setActive(id, dto.active, this.actor(sellerId));
  }
}
```

- [ ] **Step 4: Register the controller + guard in the module**

In `apps/api/src/products/products.module.ts`, add the seller controller and ensure `SellerApprovedGuard` resolves. The guard depends on `PrismaService` (already available via `PrismaModule`, imported). Add the guard as a provider so Nest can instantiate it for `@UseGuards`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsController } from './products.controller';
import { SellerProductsController } from './seller-products.controller';
import { ProductsService } from './products.service';
import { SellerApprovedGuard } from '../sellers/guards/seller-approved.guard';

/** Products domain: public catalog reads, admin CRUD, and seller-scoped CRUD. */
@Module({
  imports: [PrismaModule],
  controllers: [ProductsController, SellerProductsController],
  providers: [ProductsService, SellerApprovedGuard],
  exports: [ProductsService],
})
export class ProductsModule {}
```

(`@UseGuards(SellerApprovedGuard)` with the class token requires the guard to be resolvable by Nest's DI in this module's context; providing it here does that. If `SellersModule` already exports it, importing that module is an alternative — but providing it locally is simpler and PrismaModule is its only dep.)

- [ ] **Step 5: Run the controller spec — verify green**

Run: `cd apps/api && npm test -- seller-products.controller`
Expected: PASS (6 tests).

- [ ] **Step 6: tsc + full unit suite + lint**

Run: `cd apps/api && npx tsc -p tsconfig.build.json --noEmit && npm test && npm run lint`
Expected: 0 tsc errors; full suite green (was 339 + guard/decorator/controller additions); lint clean.

- [ ] **Step 7: Boot smoke — confirm routes are mapped**

Run `npm run start:dev` in the background; poll `localhost:5000/products` for 200. In the boot log, confirm the new routes are mapped (Nest logs `Mapped {/seller/products, GET} route` etc.). Stop the server.
Expected: 6 `/seller/products*` routes mapped; app boots clean.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/products/seller-products.controller.ts apps/api/src/products/seller-products.controller.spec.ts apps/api/src/products/products.module.ts
git commit -m "feat(m2): seller product CRUD API (/seller/products), scoped to the acting seller"
```

---

### Task 3: e2e — seller isolation proven over HTTP

**Files:**
- Create: `apps/api/test/seller-products.e2e-spec.ts`

**Interfaces:**
- Consumes: the running app, the seeded Platform Seller + an ACTIVE test seller. Proves the acceptance criteria over HTTP: ACTIVE seller CRUD on own products; cross-tenant 404; non-seller blocked.

- [ ] **Step 1: Read an existing e2e spec to match setup conventions**

Read the existing e2e tests under `apps/api/test/` (e.g. the seller-register or auth e2e). Note how they (a) build the Nest app (`Test.createTestingModule({ imports: [AppModule] })`), (b) obtain tokens (POST `/auth/login` or `/auth/register` then login), (c) clean up created rows. Match that exact setup — do NOT invent a new harness.

- [ ] **Step 2: Write the e2e spec**

Create `apps/api/test/seller-products.e2e-spec.ts`. It must cover, against the real app + `ecom_dev` (or the e2e DB the existing suite uses):

1. **Setup:** register + approve (or seed ACTIVE) two sellers, Seller A and Seller B, and obtain a SELLER access token for each (register → admin-approve via `PATCH /admin/sellers/:id/status` → re-login so the token carries the SELLER role, mirroring the M1 seller e2e which notes ADR-005 token-staleness). Also obtain an admin token.
2. **Create (A):** `POST /seller/products` as Seller A → 201; response product is owned by A (assert via `GET /seller/products/:id` as A → 200).
3. **Isolation read:** `GET /seller/products/:id` (A's product id) as **Seller B** → **404** (not 403).
4. **Isolation write:** `PATCH /seller/products/:id` (A's product) as Seller B → **404**.
5. **List scoping:** `GET /seller/products` as A returns only A's products (B's are absent); same for B.
6. **Non-seller blocked:** `GET /seller/products` with a CUSTOMER token (or no seller row) → **403** (SellerApprovedGuard). With no token → 401.
7. **Admin surface intact:** `GET /products` (public) still 200; admin `POST /products` still 201 (owned by platform seller) — quick assertion that the new controller didn't disturb the existing one.
8. **Cleanup:** delete the products + test sellers/users created (mirror the existing e2e cleanup pattern; do not leave rows behind).

Use the existing suite's request helper (Supertest `request(app.getHttpServer())`). Keep assertions on status codes + ownership, not on full bodies.

- [ ] **Step 3: Run the e2e suite**

Run: `cd apps/api && npm run test:e2e`
Expected: PASS — all existing e2e (5) + the new seller-products e2e. If the e2e harness needs the DB seeded, seed it first (`npx prisma db seed`).

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/seller-products.e2e-spec.ts
git commit -m "test(m2): e2e seller product isolation (own CRUD, cross-tenant 404, non-seller 403)"
```

---

### Task 4: Slice verification gate + tracker

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md` (M2 note: slice 3 done)

- [ ] **Step 1: Full slice gate**

From `apps/api`: `npm test` (full), `npm run test:e2e`, `npm run lint`, `npx tsc -p tsconfig.build.json --noEmit` (0 errors). From repo root: `git status --porcelain` (clean), `git worktree list` (single), no `.claude/worktrees/` strays.
Expected: all green.

- [ ] **Step 2: HTTP smoke (the headline: seller scoping now reachable)**

Boot `npm run start:dev`. Two ACTIVE sellers (seed/approve as needed). As Seller A: create a product (201), GET it (200); as Seller B: GET A's product id (404). As admin: `GET /products` still lists cross-seller. Stop the server; clean up created rows.

- [ ] **Step 3: Update tracker**

In `docs/IMPLEMENTATION_PLAN.md`, update the M2 row note: append "slice 3 (seller product CRUD API /seller/products + SellerApprovedGuard attaches sellerId + @CurrentSeller; seller isolation proven over HTTP) done; next: slice 4 CSV bulk import."

- [ ] **Step 4: Commit**

```bash
git add docs/IMPLEMENTATION_PLAN.md
git commit -m "docs(m2): mark slice 3 (seller product API) done"
```

- [ ] **Step 5: STOP and ask the user to verify (RULE.md §1)**

Summarize changes, files, test counts, and the HTTP isolation smoke (A creates, B 404s). Note slice 4 is CSV import. Do not push.

---

## Self-Review

**Spec coverage (against `2026-06-22-m2-seller-system-design.md` §Slice plan row 3 + acceptance criteria):**
- Seller-scoped `GET/POST/PATCH /products` → `SellerProductsController` at `/seller/products` (list/get/create/update/archive/setActive) — Task 2. ✓
- "sold by" projection / admin cross-seller retained → admin `/products` untouched; seller sees only own (Task 2 + slice-2 scoping). ✓ (The admin "sold by" *display* column is a later admin-UI slice (6); the API already returns `sellerId`.)
- Guard resolves+attaches `sellerId` (the deferred piece from slice 2) → Task 1. ✓
- Acceptance: Seller A owns what they create; A cannot read/modify B's product (→404); admin sees all → Task 3 e2e (2,3,4,5,7). ✓
- ACTIVE-only access (suspended/pending blocked) → SellerApprovedGuard (existing tests) + Task 3 non-seller 403. ✓
- Per-seller SKU (two sellers may share a SKU; own dup → 409) → inherited from slice 1; optionally asserted in e2e. ✓

**Placeholder scan:** No TBD/TODO. Task 3 Step 2 enumerates the exact e2e cases with expected status codes rather than pasting full code, because the e2e harness/token-acquisition must match the existing suite's setup (Step 1 makes the implementer read it first) — these are concrete, enumerated requirements, not vague ones. The unit-level code (guard, decorator, controller) is given in full.

**Type consistency:** `ScopeActor = { role: Role; sellerId?: string }` (slice 1) — the controller builds `{ role: Role.SELLER, sellerId }`. `@CurrentSeller()` returns `string`; `extractSellerId(req)` is the tested pure core. Guard `select` widened to `{ id: true, status: true }` — the two existing spec assertions are updated to match (Task 1 Step 1). `ProductsService` signatures consumed exactly as defined in slice 2.

**Note on the decorator-testability refactor:** `createParamDecorator` factories are awkward to unit-test directly, so `@CurrentSeller` delegates to an exported pure `extractSellerId(req)` that the spec covers. This mirrors the project's preference for testable pure cores (e.g. `resolveSession`, `buildSellerScope`). The `@CurrentUser` decorator is not refactored (out of scope; untouched).
