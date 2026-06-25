# M3a Catalog V2 — Slice 1: Public Seller-Read API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two public API endpoints — `GET /sellers/:slug` (public seller profile) and `GET /sellers/:slug/products` (that seller's ACTIVE catalog) — so the storefront can attribute products to sellers and render seller storefront pages in later slices.

**Architecture:** A new `PublicSellersController` (`@Controller('sellers')`, both routes `@Public()`) delegates to `SellersService` (slug→public-view + slug→active-id resolution) and the existing `ProductsService.list()` (reused via a new optional `{ sellerId }` filter, orthogonal to ownership scoping). A dedicated `toPublicSellerView` projection exposes only 5 public fields, never KYC/status.

**Tech Stack:** NestJS + TypeScript, Prisma 7 (driver-adapter), Jest (mocked Prisma) for unit tests, supertest for e2e.

**Spec:** `docs/superpowers/specs/2026-06-23-m3a-slice1-public-seller-read-api-design.md`

## Global Constraints

- Strict TypeScript; no `any` (project convention).
- Public endpoints use `@Public()` (the global `JwtAuthGuard` otherwise requires a token).
- Public reads use the existing unscoped actor pattern: `PUBLIC_READ_ACTOR: ScopeActor = { role: Role.ADMIN }` (→ `buildSellerScope` returns `{}`).
- Public seller view exposes **exactly** `{ id, displayName, slug, description, logoUrl }` — never `status`, KYC fields/flags, timestamps, or bank info.
- Public visibility gate: a seller is publicly reachable **only** if `status === SellerStatus.ACTIVE` AND `deletedAt === null`; otherwise 404. Products listed are **only** `status === ProductStatus.ACTIVE`, non-soft-deleted.
- No migration in this slice (`ratingAvg/ratingCount` deferred to Slice 4 / migration F2).
- Verify with `npx tsc --noEmit` explicitly — `nest build` swallows tsc errors (project memory). Smoke-run vs `ecom_dev` before "done" (RULE.md §5).
- Commit messages end with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. **Do not `git push`** (RULE.md §3).
- Run all commands from `apps/api` (use `npm --prefix apps/api ...` or `cd` per the harness rules). Test runner: `npm test` (Jest); single file: `npm test -- <pattern>`.

---

## File Structure

- **Create** `apps/api/src/sellers/public-seller-view.ts` — `PublicSellerView` interface + `toPublicSellerView()` pure projection.
- **Create** `apps/api/src/sellers/public-seller-view.spec.ts` — leak-regression unit test for the projection.
- **Create** `apps/api/src/sellers/public-sellers.controller.ts` — public controller, both routes.
- **Modify** `apps/api/src/sellers/sellers.service.ts` — add `getPublicBySlug()` + `getActiveSellerIdBySlug()`.
- **Modify** `apps/api/src/sellers/sellers.service.spec.ts` — tests for the two new methods (file may not exist yet — create if absent, mirroring the products spec style).
- **Modify** `apps/api/src/products/products.service.ts` — add optional `filter` arg to `list()` + apply in `buildWhere()`.
- **Modify** `apps/api/src/products/products.service.spec.ts` — test the `{ sellerId }` filter.
- **Modify** `apps/api/src/sellers/sellers.module.ts` — register `PublicSellersController`; import `ProductsModule`.
- **Modify** `apps/api/src/products/products.module.ts` — ensure `ProductsService` is exported (verify; add if missing).
- **Create** `apps/api/test/public-sellers.e2e-spec.ts` — e2e 200/404 for both routes (mirror existing e2e style).

---

## Task 1: `toPublicSellerView` projection + leak-regression test

**Files:**
- Create: `apps/api/src/sellers/public-seller-view.ts`
- Test: `apps/api/src/sellers/public-seller-view.spec.ts`

**Interfaces:**
- Consumes: `Seller` from `@prisma/client`.
- Produces:
  - `interface PublicSellerView { id: string; displayName: string; slug: string; description: string | null; logoUrl: string | null }`
  - `function toPublicSellerView(seller: PublicSellerInput): PublicSellerView` where `PublicSellerInput = Pick<Seller, 'id' | 'displayName' | 'slug' | 'description' | 'logoUrl'>`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/sellers/public-seller-view.spec.ts`:

```typescript
import { SellerStatus } from '@prisma/client';
import { toPublicSellerView } from './public-seller-view';

describe('toPublicSellerView', () => {
  it('returns exactly the 5 public fields and nothing else', () => {
    // A full seller row, including fields that must NOT leak publicly.
    const fullSeller = {
      id: 's1',
      displayName: 'Demo Shop',
      slug: 'demo-shop',
      description: 'We sell demo things',
      logoUrl: 'https://cdn.example.com/logo.png',
      status: SellerStatus.ACTIVE,
      gstin: 'SECRET-GSTIN',
      pan: 'SECRET-PAN',
      bankAccountNo: '000012345678',
      bankIfsc: 'HDFC0001234',
      kycVerifiedAt: new Date('2026-01-01'),
      commissionRate: null,
      userId: 'u1',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      deletedAt: null,
    };

    const view = toPublicSellerView(fullSeller);

    expect(view).toEqual({
      id: 's1',
      displayName: 'Demo Shop',
      slug: 'demo-shop',
      description: 'We sell demo things',
      logoUrl: 'https://cdn.example.com/logo.png',
    });
    // Explicit leak guard: the output key set is exactly the 5 public keys.
    expect(Object.keys(view).sort()).toEqual(
      ['description', 'displayName', 'id', 'logoUrl', 'slug'].sort(),
    );
  });

  it('preserves null description and logoUrl', () => {
    const view = toPublicSellerView({
      id: 's2',
      displayName: 'No Frills',
      slug: 'no-frills',
      description: null,
      logoUrl: null,
    });
    expect(view).toEqual({
      id: 's2',
      displayName: 'No Frills',
      slug: 'no-frills',
      description: null,
      logoUrl: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/api test -- public-seller-view`
Expected: FAIL — `Cannot find module './public-seller-view'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/sellers/public-seller-view.ts`:

```typescript
/**
 * public-seller-view.ts
 *
 * Pure projection: converts a Seller DB record into the PUBLIC seller view.
 *
 * Security contract: the public view exposes ONLY the shop's presentational
 * fields. It MUST NOT carry status, KYC fields/flags, timestamps, or bank info
 * — those belong to the admin/owner view (`toSellerView` in seller-mask.ts).
 */

import { Seller } from '@prisma/client';

/** The only fields exposed on the public, unauthenticated seller surface. */
export interface PublicSellerView {
  id: string;
  displayName: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
}

/** Input — only the fields this projection reads. */
type PublicSellerInput = Pick<
  Seller,
  'id' | 'displayName' | 'slug' | 'description' | 'logoUrl'
>;

/** Maps a Seller record to its public view (5 fields, nothing else). */
export function toPublicSellerView(seller: PublicSellerInput): PublicSellerView {
  return {
    id: seller.id,
    displayName: seller.displayName,
    slug: seller.slug,
    description: seller.description,
    logoUrl: seller.logoUrl,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/api test -- public-seller-view`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/sellers/public-seller-view.ts apps/api/src/sellers/public-seller-view.spec.ts
git commit -m "feat(m3a): public seller view projection (5 public fields, leak-guarded)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `SellersService` — `getPublicBySlug` + `getActiveSellerIdBySlug`

**Files:**
- Modify: `apps/api/src/sellers/sellers.service.ts`
- Test: `apps/api/src/sellers/sellers.service.spec.ts` (create if absent)

**Interfaces:**
- Consumes: `toPublicSellerView`, `PublicSellerView` (Task 1); `PrismaService`; `NotFoundException`; `SellerStatus` from `@prisma/client`.
- Produces (new public methods on `SellersService`):
  - `getPublicBySlug(slug: string): Promise<PublicSellerView>`
  - `getActiveSellerIdBySlug(slug: string): Promise<string>`

  Both apply the gate `{ slug, status: SellerStatus.ACTIVE, deletedAt: null }` and throw `NotFoundException` when no row matches.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/sellers/sellers.service.spec.ts` (if the file does not exist, create it with this content; if it exists, add this `describe` block and extend the prisma mock's `seller` object with `findFirst: jest.fn()`):

```typescript
import { NotFoundException } from '@nestjs/common';
import { SellerStatus } from '@prisma/client';
import { SellersService } from './sellers.service';

// Minimal mocks — these methods are the only deps the public-read paths touch.
const makeDeps = () => {
  const prisma = {
    seller: {
      findFirst: jest.fn(),
    },
  };
  const audit = { record: jest.fn() };
  const cipher = { encrypt: jest.fn(), decrypt: jest.fn() };
  const events = { emit: jest.fn() };
  return { prisma, audit, cipher, events };
};

const buildService = () => {
  const { prisma, audit, cipher, events } = makeDeps();
  // Constructor arg order: (prisma, audit, cipher, events) — see sellers.service.ts.
  const svc = new SellersService(
    prisma as never,
    audit as never,
    cipher as never,
    events as never,
  );
  return { svc, prisma };
};

const activeSeller = {
  id: 's1',
  displayName: 'Demo Shop',
  slug: 'demo-shop',
  description: 'desc',
  logoUrl: null,
  status: SellerStatus.ACTIVE,
  gstin: 'SECRET',
  pan: 'SECRET',
  bankAccountNo: '000012345678',
  bankIfsc: 'IFSC',
  kycVerifiedAt: null,
  commissionRate: null,
  userId: 'u1',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe('SellersService public reads', () => {
  describe('getPublicBySlug', () => {
    it('returns the public view for an ACTIVE, non-deleted seller', async () => {
      const { svc, prisma } = buildService();
      prisma.seller.findFirst.mockResolvedValue(activeSeller);

      const res = await svc.getPublicBySlug('demo-shop');

      // Gate asserted on the where clause.
      const [call] = prisma.seller.findFirst.mock.calls as Array<
        [{ where: Record<string, unknown> }]
      >;
      expect(call[0].where).toEqual({
        slug: 'demo-shop',
        status: SellerStatus.ACTIVE,
        deletedAt: null,
      });
      // Only public fields leak out.
      expect(res).toEqual({
        id: 's1',
        displayName: 'Demo Shop',
        slug: 'demo-shop',
        description: 'desc',
        logoUrl: null,
      });
    });

    it('throws NotFoundException when no ACTIVE seller matches', async () => {
      const { svc, prisma } = buildService();
      prisma.seller.findFirst.mockResolvedValue(null);
      await expect(svc.getPublicBySlug('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getActiveSellerIdBySlug', () => {
    it('returns the id for an ACTIVE, non-deleted seller', async () => {
      const { svc, prisma } = buildService();
      prisma.seller.findFirst.mockResolvedValue({ id: 's1' });
      await expect(svc.getActiveSellerIdBySlug('demo-shop')).resolves.toBe('s1');
    });

    it('throws NotFoundException when no ACTIVE seller matches', async () => {
      const { svc, prisma } = buildService();
      prisma.seller.findFirst.mockResolvedValue(null);
      await expect(
        svc.getActiveSellerIdBySlug('missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
```

> **Note for the implementer:** before writing this test, open `sellers.service.ts` and confirm the constructor parameter order. The block above assumes `(prisma, audit, cipher, events)`. If the real order differs, adjust the `new SellersService(...)` arg order to match — the mocks are positional.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/api test -- sellers.service`
Expected: FAIL — `getPublicBySlug is not a function` (and `getActiveSellerIdBySlug`).

- [ ] **Step 3: Write minimal implementation**

In `apps/api/src/sellers/sellers.service.ts`:

Add imports at the top (merge with existing import lines):
```typescript
import { toPublicSellerView, PublicSellerView } from './public-seller-view';
```
Ensure `SellerStatus` is in the existing `@prisma/client` import and `NotFoundException` in the existing `@nestjs/common` import (both are already imported per the current file — verify, add if missing).

Add these two methods to the `SellersService` class body:

```typescript
  /**
   * Public seller profile by slug. Only an ACTIVE, non-soft-deleted seller is
   * publicly reachable; anything else → 404 (no existence leak). Returns the
   * 5-field public view — never status/KYC/timestamps.
   */
  async getPublicBySlug(slug: string): Promise<PublicSellerView> {
    const seller = await this.prisma.seller.findFirst({
      where: { slug, status: SellerStatus.ACTIVE, deletedAt: null },
    });
    if (!seller) throw new NotFoundException('Seller not found');
    return toPublicSellerView(seller);
  }

  /**
   * Resolves a slug to its seller id under the same public visibility gate as
   * getPublicBySlug, so the public products endpoint 404s consistently for a
   * shop that isn't publicly visible.
   */
  async getActiveSellerIdBySlug(slug: string): Promise<string> {
    const seller = await this.prisma.seller.findFirst({
      where: { slug, status: SellerStatus.ACTIVE, deletedAt: null },
      select: { id: true },
    });
    if (!seller) throw new NotFoundException('Seller not found');
    return seller.id;
  }
```

> The injected Prisma client is `this.prisma` (confirm the property name in the constructor — it is `private readonly prisma: PrismaService`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/api test -- sellers.service`
Expected: PASS (4 new tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/sellers/sellers.service.ts apps/api/src/sellers/sellers.service.spec.ts
git commit -m "feat(m3a): SellersService public slug reads (ACTIVE gate, 404 otherwise)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `ProductsService.list()` optional `{ sellerId }` filter

**Files:**
- Modify: `apps/api/src/products/products.service.ts` (signature of `list()` ~line 87; `buildWhere()` ~line 119)
- Test: `apps/api/src/products/products.service.spec.ts`

**Interfaces:**
- Consumes: existing `ListProductsDto`, `ScopeActor`, `Paginated<Product>`.
- Produces: new optional third parameter on `list()`:
  - `list(query: ListProductsDto, actor: ScopeActor, filter?: { sellerId?: string }): Promise<Paginated<Product>>`
  - When `filter.sellerId` is set, the Prisma `where` includes `sellerId`. This is **independent** of `buildSellerScope(actor)` (caller-confinement). Existing 2-arg callers are unaffected.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/products/products.service.spec.ts` inside the top-level `describe('ProductsService', ...)` block (after the existing `list`/`buildWhere` tests; if none, add a new `describe('list', ...)`):

```typescript
  describe('list with sellerId filter', () => {
    it('adds sellerId to the where clause when the filter is provided', async () => {
      const { svc, prisma } = build();
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await svc.list({ status: ProductStatus.ACTIVE }, ADMIN, {
        sellerId: 'seller-x',
      });

      const [findCall] = prisma.product.findMany.mock.calls as Array<
        [{ where: Record<string, unknown> }]
      >;
      expect(findCall[0].where).toEqual(
        expect.objectContaining({
          sellerId: 'seller-x',
          status: ProductStatus.ACTIVE,
          deletedAt: null,
        }),
      );
    });

    it('does not add sellerId when no filter is provided (existing behavior)', async () => {
      const { svc, prisma } = build();
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await svc.list({}, ADMIN);

      const [findCall] = prisma.product.findMany.mock.calls as Array<
        [{ where: Record<string, unknown> }]
      >;
      expect(findCall[0].where).not.toHaveProperty('sellerId');
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/api test -- products.service`
Expected: FAIL — the first test's `where` has no `sellerId` (the third arg is ignored / not yet supported).

- [ ] **Step 3: Write minimal implementation**

In `apps/api/src/products/products.service.ts`:

Change the `list` signature and pass the filter into `buildWhere`:

```typescript
  async list(
    query: ListProductsDto,
    actor: ScopeActor,
    filter?: { sellerId?: string },
  ): Promise<Paginated<Product>> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const where = this.buildWhere(query, actor, filter);
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

Change `buildWhere` to accept and apply the filter (the `sellerId` filter is applied AFTER `buildSellerScope` so the two are clearly distinct; for public callers `buildSellerScope` returns `{}`):

```typescript
  /** Translates list filters into a Prisma `where` (always excludes soft-deleted). */
  private buildWhere(
    query: ListProductsDto,
    actor: ScopeActor,
    filter?: { sellerId?: string },
  ): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...buildSellerScope(actor),
    };

    // Explicit, caller-supplied seller filter (e.g. a public seller storefront
    // listing). Distinct from buildSellerScope, which confines the *actor*.
    if (filter?.sellerId) where.sellerId = filter.sellerId;

    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      where.OR = [
        { name: contains },
        { sku: contains },
        { description: contains },
      ];
    }
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.status) where.status = query.status;

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = {
        ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
      };
    }

    return where;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/api test -- products.service`
Expected: PASS (all existing products.service tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/products/products.service.ts apps/api/src/products/products.service.spec.ts
git commit -m "feat(m3a): optional sellerId filter on ProductsService.list (orthogonal to scope)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `PublicSellersController` + module wiring

**Files:**
- Create: `apps/api/src/sellers/public-sellers.controller.ts`
- Modify: `apps/api/src/sellers/sellers.module.ts`
- Modify: `apps/api/src/products/products.module.ts` (verify `ProductsService` is exported)
- Test: `apps/api/test/public-sellers.e2e-spec.ts`

**Interfaces:**
- Consumes: `SellersService.getPublicBySlug`, `SellersService.getActiveSellerIdBySlug` (Task 2); `ProductsService.list` with the `{ sellerId }` filter (Task 3); `ListProductsDto`; `ScopeActor`; `Public` decorator; `Role`, `ProductStatus` from `@prisma/client`.
- Produces: HTTP routes `GET /sellers/:slug` and `GET /sellers/:slug/products`.

- [ ] **Step 1: Verify `ProductsModule` exports `ProductsService`**

Open `apps/api/src/products/products.module.ts`. Confirm the `@Module({...})` includes `exports: [ProductsService]`. If it does not, add it:

```typescript
@Module({
  imports: [PrismaModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
```
(Match the file's existing imports/providers — only ensure `exports` contains `ProductsService`.)

- [ ] **Step 2: Write the failing e2e test**

Create `apps/api/test/public-sellers.e2e-spec.ts`. First open an existing e2e spec in `apps/api/test/` to copy the exact bootstrap (app creation, global pipes/guards, Prisma seeding/cleanup helpers, and how a seeded ACTIVE seller + ACTIVE product are created). Mirror that harness. The test must assert:

```typescript
// Mirror the bootstrap of an existing *.e2e-spec.ts in apps/api/test/.
// The four behavioral assertions this slice requires:
//
// 1. GET /sellers/:slug for a seeded ACTIVE seller → 200 and the body has
//    EXACTLY keys [id, displayName, slug, description, logoUrl]
//    (assert: Object.keys(res.body).sort() deep-equals that set;
//     assert res.body.status === undefined and res.body.gstin === undefined).
//
// 2. GET /sellers/:slug for an unknown / non-ACTIVE slug → 404.
//
// 3. GET /sellers/:slug/products for the ACTIVE seller → 200, paginated
//    envelope { data, page, pageSize, total, totalPages }; every item in
//    data has status === 'ACTIVE'; an INACTIVE/ARCHIVED product of that
//    seller does NOT appear.
//
// 4. GET /sellers/:slug/products for an unknown / non-ACTIVE slug → 404.
//
// Example assertion bodies (adapt request() to the existing harness):
//
//   const res = await request(app.getHttpServer())
//     .get(`/sellers/${seededSlug}`)
//     .expect(200);
//   expect(Object.keys(res.body).sort()).toEqual(
//     ['description', 'displayName', 'id', 'logoUrl', 'slug'].sort(),
//   );
//   expect(res.body.status).toBeUndefined();
//   expect(res.body.gstin).toBeUndefined();
//
//   await request(app.getHttpServer())
//     .get('/sellers/does-not-exist')
//     .expect(404);
//
//   const list = await request(app.getHttpServer())
//     .get(`/sellers/${seededSlug}/products`)
//     .expect(200);
//   expect(list.body).toEqual(
//     expect.objectContaining({ data: expect.any(Array), total: expect.any(Number) }),
//   );
//   for (const p of list.body.data) expect(p.status).toBe('ACTIVE');
//
//   await request(app.getHttpServer())
//     .get('/sellers/does-not-exist/products')
//     .expect(404);
```

> **Note:** If the existing e2e harness makes seeding a second-state product (INACTIVE) heavy, it is acceptable to cover the "only ACTIVE products listed" assertion in a controller-level unit test instead, and keep the e2e focused on 200/404 + the public-field-shape assertion. Do not skip the field-shape and 404 assertions — those are the security-critical ones.

- [ ] **Step 3: Run the e2e test to verify it fails**

Run: `npm --prefix apps/api run test:e2e -- public-sellers`
Expected: FAIL — routes return 404/Not Found for everything (controller not registered yet) or the field-shape assertion fails.

- [ ] **Step 4: Write the controller**

Create `apps/api/src/sellers/public-sellers.controller.ts`:

```typescript
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProductStatus, Role } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { SellersService } from './sellers.service';
import { ProductsService } from '../products/products.service';
import { ListProductsDto } from '../products/dto/list-products.dto';
import { ScopeActor } from '../products/seller-scope';

/** Unscoped actor for public catalog reads (ADMIN → no ownership WHERE clause). */
const PUBLIC_READ_ACTOR: ScopeActor = { role: Role.ADMIN };

/**
 * Public, unauthenticated seller storefront reads.
 *
 * Both routes are @Public(). A seller is only reachable when ACTIVE and not
 * soft-deleted (enforced in SellersService); otherwise 404. The products
 * listing forces status=ACTIVE server-side — a public caller cannot request
 * INACTIVE/ARCHIVED products.
 */
@Controller('sellers')
export class PublicSellersController {
  constructor(
    private readonly sellers: SellersService,
    private readonly products: ProductsService,
  ) {}

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.sellers.getPublicBySlug(slug);
  }

  @Public()
  @Get(':slug/products')
  async listProducts(
    @Param('slug') slug: string,
    @Query() query: ListProductsDto,
  ) {
    // 404 first if the seller isn't publicly visible (consistent with profile).
    const sellerId = await this.sellers.getActiveSellerIdBySlug(slug);
    // Force ACTIVE — a public caller cannot list non-active products.
    return this.products.list(
      { ...query, status: ProductStatus.ACTIVE },
      PUBLIC_READ_ACTOR,
      { sellerId },
    );
  }
}
```

- [ ] **Step 5: Wire the controller into the module**

In `apps/api/src/sellers/sellers.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { SellersController } from './sellers.controller';
import { AdminSellersController } from './admin-sellers.controller';
import { PublicSellersController } from './public-sellers.controller';
import { SellersService } from './sellers.service';

@Module({
  imports: [PrismaModule, ProductsModule],
  controllers: [
    SellersController,
    AdminSellersController,
    PublicSellersController,
  ],
  providers: [SellersService],
  exports: [SellersService],
})
export class SellersModule {}
```

> **Route-collision check:** `GET /sellers/:slug` lives on `PublicSellersController` (`@Controller('sellers')`), while admin routes are on `@Controller('admin/sellers')` and self-service on `@Controller('seller')` — no path overlap. Confirm no other controller already owns `@Controller('sellers')`.

- [ ] **Step 6: Run the e2e test to verify it passes**

Run: `npm --prefix apps/api run test:e2e -- public-sellers`
Expected: PASS (4 assertions).

- [ ] **Step 7: Run the full unit suite + typecheck + lint**

```bash
npm --prefix apps/api test
npx --prefix apps/api tsc --noEmit -p apps/api/tsconfig.json
npm --prefix apps/api run lint
```
Expected: all green; no regressions; tsc clean; lint clean.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/sellers/public-sellers.controller.ts apps/api/src/sellers/sellers.module.ts apps/api/src/products/products.module.ts apps/api/test/public-sellers.e2e-spec.ts
git commit -m "feat(m3a): public GET /sellers/:slug + /sellers/:slug/products

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: HTTP smoke vs `ecom_dev` (RULE.md §5)

**Files:** none (verification only).

- [ ] **Step 1: Start the API against the real dev DB**

```bash
npm --prefix apps/api run start:dev
```
Wait for "Nest application successfully started" on port 5000.

- [ ] **Step 2: Identify a seeded ACTIVE seller slug**

The seed creates a demo seller (e.g. `seller@example.com` → a `Seller` with a slug). Find its slug:
```bash
npx --prefix apps/api prisma studio
# or query the Seller table for status=ACTIVE; note the slug (e.g. "demo-shop").
```

- [ ] **Step 3: Smoke the public profile endpoint**

```bash
curl -s http://localhost:5000/sellers/<active-slug> | jq
```
Expected: 200; JSON has **only** `id, displayName, slug, description, logoUrl`. Confirm `status`, `gstin`, `pan`, `bankAccountLast4`, `kycVerifiedAt`, `createdAt` are **absent**.

- [ ] **Step 4: Smoke the products endpoint**

```bash
curl -s "http://localhost:5000/sellers/<active-slug>/products?pageSize=5" | jq '{total, count: (.data|length), statuses: [.data[].status]}'
```
Expected: 200; `Paginated` envelope; every status is `"ACTIVE"`.

- [ ] **Step 5: Smoke the 404 paths**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/sellers/no-such-shop
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/sellers/no-such-shop/products
```
Expected: `404` for both. (If a SUSPENDED/PENDING seller exists, smoke its slug too → expect 404.)

- [ ] **Step 6: Stop the server and record the result**

Stop `start:dev`. Note the smoke outcomes in the slice summary. Do **not** push.

---

## Post-implementation (not a code task)

- Update `docs/IMPLEMENTATION_PLAN.md` M3a line and/or `PLAN.md` tracker per RULE.md §2 to reflect "M3a Slice 1 — public seller-read API ✅ (branch `feat/catalog-v2`, not yet merged)".
- STOP and ask the user to verify before starting Slice 2 (storefront "sold by" link) — RULE.md §1.

---

## Self-Review

**Spec coverage:**
- `GET /sellers/:slug` contract → Task 2 (service) + Task 4 (controller/route). ✓
- `GET /sellers/:slug/products` contract (ACTIVE-only, paginated, reuse list) → Task 3 (filter) + Task 4 (route forces ACTIVE). ✓
- Public field allowlist (5 fields, no KYC/status) → Task 1 (`toPublicSellerView` + leak test), re-asserted in Task 4 e2e + Task 5 smoke. ✓
- ACTIVE+not-deleted seller gate; 404 otherwise (both endpoints) → Task 2 (shared gate via `getActiveSellerIdBySlug`), Task 4 e2e, Task 5 smoke. ✓
- Empty catalog → 200 `data: []` → covered by the `Paginated` envelope returned from `list()` (no special-casing needed; e2e envelope assertion). ✓
- Status forced server-side → Task 4 controller `{ ...query, status: ACTIVE }`. ✓
- Reuse `products.service.list` via orthogonal `{ sellerId }` filter (Approach A) → Task 3. ✓
- No migration → no migration task present. ✓
- Verification (suite + tsc --noEmit + lint + HTTP smoke) → Task 4 Step 7 + Task 5. ✓

**Placeholder scan:** All code steps contain real code. The e2e test (Task 4) is described with concrete assertion bodies + an explicit instruction to mirror the existing harness (the one piece that genuinely depends on the repo's e2e bootstrap, which the implementer must read) — with a documented fallback to controller-level unit tests for the ACTIVE-only assertion. No "TBD"/"add validation"/"similar to Task N".

**Type consistency:** `PublicSellerView` (Task 1) is the return type of `getPublicBySlug` (Task 2), consumed by the controller (Task 4). `getActiveSellerIdBySlug` returns `string`, used as `{ sellerId }` into `list(..., { sellerId })` matching the Task 3 signature `filter?: { sellerId?: string }`. `PUBLIC_READ_ACTOR: ScopeActor = { role: Role.ADMIN }` matches the existing products controller pattern. All consistent.
