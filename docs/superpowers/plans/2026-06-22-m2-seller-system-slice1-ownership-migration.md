# M2 Seller System — Slice 1: Ownership Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `Product` and `InventoryItem` a non-null `sellerId` owner and relax the product SKU uniqueness to per-seller (`@@unique([sku, sellerId])`), backfilling all existing rows to the seeded Platform Seller — without leaving `main`'s build or seed broken.

**Architecture:** Expand → backfill → contract (`MIGRATION_PLAN §2.2`, Wave B1–B5). Four migrations in order: add nullable `sellerId` + index (B1/B2) → backfill via the idempotent seed (B3) → NOT NULL + FK (B4) → drop `Product_sku_key`, add composite unique (B5). The B5 change is the deliberate forward-only break; it ships in the same slice as its three semantic call-site fixes (`products.service.create`, `mapWriteError` semantics, and the **seed's product upsert**, which uses `where: { sku }` and would otherwise break).

**Tech Stack:** NestJS + Prisma 7 (driver adapter `@prisma/adapter-pg`), PostgreSQL (`ecom_dev` / shadow `ecom_shadow`), Jest. Migrations via `npx prisma migrate dev`; seed via `npx prisma db seed`.

## Global Constraints

- Strict TypeScript, no `any`. (`apps/api/CLAUDE.md`)
- Every new FK gets an `@@index`; every PK `cuid()`; money columns `Decimal(12,2)`. (`MIGRATION_PLAN §0.5`)
- New columns nullable-first; NOT NULL/FK only after a backfill step exists. (`MIGRATION_PLAN §0.1`)
- One migration = one concern; the composite-unique index swap (B5) is its own migration file. (`MIGRATION_PLAN §0.2`)
- DB: `ecom_dev`, user `sotsys033`, no password. Never touch the unrelated `ecomm` DB. (`PLAN.md` Gotchas)
- Prisma 7: connection URLs live in `prisma.config.ts`, not `schema.prisma`; `PrismaClient` requires the pg adapter (already wired). (`PLAN.md` Gotchas)
- NestJS compiled entry is `dist/src/main.js`; use `npm run start:dev` for smoke runs. (`PLAN.md` Gotchas)
- No `git push` without explicit permission. (RULE.md §3)
- Branch for all slice-1 code: `feat/seller-system` (merge order 2, `WORKTREE_EXECUTION_PLAN.md`). Created via `superpowers:using-git-worktrees` at execution time.
- `PLATFORM_SELLER_SLUG = 'platform'` — the seeded Platform Seller's slug (`prisma/seed.ts`).

## File Structure

- `apps/api/prisma/schema.prisma` — add `sellerId` relations on `Product` + `InventoryItem`, back-relations on `Seller`, swap `Product.sku @unique` → `@@unique([sku, sellerId])`. (Edited across Tasks 1, 3, 4.)
- `apps/api/prisma/migrations/<ts>_add_seller_ownership_nullable/migration.sql` — B1+B2 (Task 1).
- `apps/api/prisma/seed.ts` — backfill block (B3) + fix the product upsert for the composite key (Task 2, Task 4).
- `apps/api/prisma/migrations/<ts>_seller_ownership_not_null_fk/migration.sql` — B4 (Task 3).
- `apps/api/prisma/migrations/<ts>_product_sku_composite_unique/migration.sql` — B5 (Task 4).
- `apps/api/src/products/products.service.ts` — `create` sets `sellerId`; `mapWriteError` unchanged but documented as per-seller (Task 4).
- `apps/api/src/products/products.service.spec.ts` — assert `create` passes a `sellerId`; dup-SKU still 409 (Task 4).
- `apps/api/src/products/platform-seller.ts` (new) — `PLATFORM_SELLER_SLUG` constant + a `resolvePlatformSellerId(prisma)` helper, so the create path has a single source for the default owner (Task 4).

---

### Task 1: Add nullable `sellerId` columns + indexes (B1/B2)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Product, InventoryItem, Seller models)
- Create: `apps/api/prisma/migrations/<ts>_add_seller_ownership_nullable/migration.sql` (generated)

**Interfaces:**
- Produces: `Product.sellerId String?`, `InventoryItem.sellerId String?` (nullable, no FK yet); `Seller.products Product[]`, `Seller.inventoryItems InventoryItem[]` back-relations.

- [ ] **Step 1: Edit schema — add nullable `sellerId` + relation on Product**

In `model Product`, after `categoryId String` add:

```prisma
  seller      Seller?        @relation(fields: [sellerId], references: [id])
  sellerId    String?
```

And add to the `Product` index block:

```prisma
  @@index([sellerId])
```

- [ ] **Step 2: Edit schema — add nullable `sellerId` + relation on InventoryItem**

In `model InventoryItem`, after `productId String @unique` add:

```prisma
  seller         Seller?             @relation(fields: [sellerId], references: [id])
  sellerId       String?
```

And add to the `InventoryItem` index block:

```prisma
  @@index([sellerId])
```

- [ ] **Step 3: Edit schema — add back-relations on Seller**

In `model Seller`, before the closing `}` (after `deletedAt DateTime?`), add:

```prisma
  products      Product[]
  inventoryItems InventoryItem[]
```

- [ ] **Step 4: Generate the migration (create-only, do not apply yet)**

Run: `cd apps/api && npx prisma migrate dev --name add_seller_ownership_nullable --create-only`
Expected: a new `prisma/migrations/<ts>_add_seller_ownership_nullable/migration.sql` containing `ALTER TABLE "Product" ADD COLUMN "sellerId" TEXT;`, the same for `InventoryItem`, and two `CREATE INDEX … "sellerId"` statements. **No NOT NULL, no FK.**

- [ ] **Step 5: Verify the generated SQL is additive-only**

Read `prisma/migrations/<ts>_add_seller_ownership_nullable/migration.sql`.
Expected: only `ADD COLUMN … TEXT` (nullable) + `CREATE INDEX`. If it contains `NOT NULL`, `ADD CONSTRAINT … FOREIGN KEY`, or any `DROP`, the schema edit was wrong — fix and regenerate.

- [ ] **Step 6: Apply the migration to `ecom_dev`**

Run: `cd apps/api && npx prisma migrate dev`
Expected: "Already in sync" for the new migration applied; `prisma generate` runs clean.

- [ ] **Step 7: Verify columns exist and are nullable**

Run: `psql ecom_dev -c '\d "Product"' | grep sellerId` and `psql ecom_dev -c '\d "InventoryItem"' | grep sellerId`
Expected: `sellerId | text |` (no "not null") on both.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(m2): add nullable Product/InventoryItem sellerId + indexes (B1/B2)"
```

---

### Task 2: Backfill `sellerId` to the Platform Seller (B3)

**Files:**
- Modify: `apps/api/prisma/seed.ts` (add a backfill block after the Platform Seller upsert)

**Interfaces:**
- Consumes: the seeded Platform Seller (slug `platform`) from `prisma/seed.ts`.
- Produces: every existing `Product` and `InventoryItem` row has a non-null `sellerId`. Idempotent (`IS NULL`-guarded).

- [ ] **Step 1: Add the backfill block to seed.ts**

In `apps/api/prisma/seed.ts`, the Platform Seller upsert returns into a variable. Change:

```ts
  await prisma.seller.upsert({
    where: { userId: adminUser.id },
    update: {},
    create: {
      userId: adminUser.id,
      displayName: 'Platform',
      slug: 'platform',
      status: SellerStatus.ACTIVE,
    },
  });
```

to capture it and backfill:

```ts
  const platformSeller = await prisma.seller.upsert({
    where: { userId: adminUser.id },
    update: {},
    create: {
      userId: adminUser.id,
      displayName: 'Platform',
      slug: 'platform',
      status: SellerStatus.ACTIVE,
    },
  });

  // B3 backfill (idempotent): existing catalog/inventory predates seller ownership.
  // Only rows with a null sellerId are touched, so re-running is a no-op.
  const productBackfill = await prisma.product.updateMany({
    where: { sellerId: null },
    data: { sellerId: platformSeller.id },
  });
  const inventoryBackfill = await prisma.inventoryItem.updateMany({
    where: { sellerId: null },
    data: { sellerId: platformSeller.id },
  });
  console.log(
    `Backfilled sellerId: ${productBackfill.count} products, ${inventoryBackfill.count} inventory items.`,
  );
```

- [ ] **Step 2: Run the seed against `ecom_dev`**

Run: `cd apps/api && npx prisma db seed`
Expected: "Seed complete." and a "Backfilled sellerId: N products, M inventory items." line (N/M ≥ the seeded rows on first run).

- [ ] **Step 3: Assert no null sellerId remains (the B3 validation, `MIGRATION_PLAN §2.2`)**

Run: `psql ecom_dev -tc 'SELECT count(*) FROM "Product" WHERE "sellerId" IS NULL;'` and the same for `"InventoryItem"`.
Expected: `0` for both.

- [ ] **Step 4: Confirm idempotency — re-run the seed**

Run: `cd apps/api && npx prisma db seed`
Expected: "Backfilled sellerId: 0 products, 0 inventory items." (nothing left to backfill).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/seed.ts
git commit -m "feat(m2): backfill Product/InventoryItem sellerId to platform seller (B3)"
```

---

### Task 3: Tighten `sellerId` to NOT NULL + FK (B4)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (make the `seller` relations required)
- Create: `apps/api/prisma/migrations/<ts>_seller_ownership_not_null_fk/migration.sql` (generated)

**Interfaces:**
- Consumes: backfilled non-null `sellerId` on all rows (Task 2).
- Produces: `Product.seller Seller` (required), `Product.sellerId String`; `InventoryItem.seller Seller` (required), `InventoryItem.sellerId String`. FK constraints `Product_sellerId_fkey`, `InventoryItem_sellerId_fkey`.

- [ ] **Step 1: Edit schema — make Product.seller required**

In `model Product`, change:

```prisma
  seller      Seller?        @relation(fields: [sellerId], references: [id])
  sellerId    String?
```

to:

```prisma
  seller      Seller         @relation(fields: [sellerId], references: [id])
  sellerId    String
```

- [ ] **Step 2: Edit schema — make InventoryItem.seller required**

In `model InventoryItem`, change:

```prisma
  seller         Seller?             @relation(fields: [sellerId], references: [id])
  sellerId       String?
```

to:

```prisma
  seller         Seller              @relation(fields: [sellerId], references: [id])
  sellerId       String
```

- [ ] **Step 3: Generate the migration (create-only)**

Run: `cd apps/api && npx prisma migrate dev --name seller_ownership_not_null_fk --create-only`
Expected: SQL with `ALTER COLUMN "sellerId" SET NOT NULL` and `ADD CONSTRAINT "Product_sellerId_fkey" FOREIGN KEY … REFERENCES "Seller"("id")` for both tables. **No SKU/index changes** (that's Task 4).

- [ ] **Step 4: Verify the SQL is contract-only (NOT NULL + FK, nothing else)**

Read the generated `migration.sql`.
Expected: only `SET NOT NULL` + `ADD CONSTRAINT … FOREIGN KEY`. If it also drops `Product_sku_key`, the schema still has the old `@unique` — that's fine, Task 4 handles it; but it must NOT appear here. If it does, you edited too much — revert the SKU line and regenerate.

- [ ] **Step 5: Apply the migration**

Run: `cd apps/api && npx prisma migrate dev`
Expected: applies cleanly (succeeds because Task 2 left no null `sellerId`). If it errors with "column contains null values", the backfill (Task 2) did not run against this DB — re-run the seed, then retry.

- [ ] **Step 6: Verify NOT NULL + FK in the DB**

Run: `psql ecom_dev -c '\d "Product"' | grep -i sellerId`
Expected: `sellerId | text | not null` and a foreign-key line referencing `"Seller"`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(m2): Product/InventoryItem sellerId NOT NULL + FK (B4)"
```

---

### Task 4: SKU composite-unique (B5) + call-site fixes — the breaking slice

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Product: drop `@unique` on `sku`, add `@@unique([sku, sellerId])`)
- Create: `apps/api/prisma/migrations/<ts>_product_sku_composite_unique/migration.sql` (generated)
- Create: `apps/api/src/products/platform-seller.ts`
- Modify: `apps/api/src/products/products.service.ts` (`create` sets `sellerId`)
- Modify: `apps/api/src/products/products.service.spec.ts` (assert sellerId set; dup-SKU still 409)
- Modify: `apps/api/prisma/seed.ts` (product upsert can no longer key on `sku` alone)

**Interfaces:**
- Consumes: required `sellerId` (Task 3); Platform Seller (Task 2).
- Produces: `Product.sku` no longer globally unique; `@@unique([sku, sellerId])`. `resolvePlatformSellerId(prisma): Promise<string>`. `ProductsService.create(dto)` writes `sellerId` (defaults to Platform Seller in slice 1; actor-scoping arrives in slice 2).

- [ ] **Step 1: Write the failing unit test — `create` passes a sellerId**

In `apps/api/src/products/products.service.spec.ts`, inside `describe('create')`, add:

```ts
    it('sets a sellerId on the created product', async () => {
      const { svc, prisma } = build();
      prisma.product.create.mockResolvedValue({ id: 'p1', ...baseCreate });

      await svc.create(baseCreate);

      const [createCall] = prisma.product.create.mock.calls as Array<
        [{ data: { sellerId?: string } }]
      >;
      expect(createCall[0].data.sellerId).toEqual(expect.any(String));
    });
```

Note: `build()` mocks Prisma; `resolvePlatformSellerId` will read `prisma.seller.findFirstOrThrow`, so extend `makePrisma()` (top of file) to add a `seller` mock:

```ts
const makePrisma = () => ({
  product: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  seller: {
    findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'platform-seller-id' }),
  },
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd apps/api && npm test -- products.service`
Expected: FAIL — `create` does not yet set `sellerId` (`createCall[0].data.sellerId` is `undefined`).

- [ ] **Step 3: Create the platform-seller helper**

Create `apps/api/src/products/platform-seller.ts`:

```ts
import { PrismaService } from '../prisma/prisma.service';

/** Slug of the seeded Platform Seller — the default owner for platform/admin-created products (M2). */
export const PLATFORM_SELLER_SLUG = 'platform';

/**
 * Resolves the Platform Seller's id. Used as the default product owner for the
 * admin/platform create-path in M2 (sellers supply their own sellerId in slice 2).
 * Throws if the Platform Seller is not seeded.
 */
export async function resolvePlatformSellerId(
  prisma: Pick<PrismaService, 'seller'>,
): Promise<string> {
  const seller = await prisma.seller.findFirstOrThrow({
    where: { slug: PLATFORM_SELLER_SLUG },
    select: { id: true },
  });
  return seller.id;
}
```

- [ ] **Step 4: Wire `create` to set `sellerId`**

In `apps/api/src/products/products.service.ts`, add the import at the top:

```ts
import { resolvePlatformSellerId } from './platform-seller';
```

Then change `create` to resolve and set the owner:

```ts
  async create(dto: CreateProductDto): Promise<Product> {
    const sellerId = await resolvePlatformSellerId(this.prisma);
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

- [ ] **Step 5: Update the dup-SKU mapping comment (semantics now per-seller)**

In `mapWriteError`, change the P2002 branch comment/message context — the message stays user-facing-correct, but annotate the now-scoped meaning:

```ts
      if (err.code === 'P2002') {
        // Unique violation is now on (sku, sellerId): a seller already has this SKU.
        return new ConflictException('A product with this SKU already exists');
      }
```

- [ ] **Step 6: Run the unit test — verify it passes**

Run: `cd apps/api && npm test -- products.service`
Expected: PASS — including the existing "rejects a duplicate SKU with 409" test (P2002 mapping unchanged).

- [ ] **Step 7: Fix the seed's product upsert (it keys on `sku` alone — breaks after B5)**

In `apps/api/prisma/seed.ts`, the product loop uses `prisma.product.upsert({ where: { sku: p.sku }, … })`. After B5, `sku` alone is not a unique selector. Replace the upsert with a findFirst-guarded create scoped to the platform seller. Move the product loop to run **after** `platformSeller` is resolved (it currently runs before the seller block — relocate the `for (const p of products)` loop to after the backfill, or hoist the platform-seller resolution above it). Change the upsert to:

```ts
    let product = await prisma.product.findFirst({
      where: { sku: p.sku, sellerId: platformSeller.id },
    });
    if (!product) {
      product = await prisma.product.create({
        data: {
          sku: p.sku,
          name: p.name,
          description: p.description,
          price: p.price,
          salePrice: p.salePrice ?? undefined,
          brand: p.brand,
          status: ProductStatus.ACTIVE,
          categoryId: p.categoryId,
          sellerId: platformSeller.id,
        },
      });
    }
```

(The `inventoryItem.upsert` keyed on `productId` is unaffected — `productId` is still `@unique` — but add `sellerId: platformSeller.id` to its `create` data so seeded inventory is owned too:)

```ts
      create: {
        productId: product.id,
        available: p.available,
        reserved: 0,
        lowStockThreshold: p.lowStockThreshold,
        sellerId: platformSeller.id,
      },
```

- [ ] **Step 8: Edit schema — swap `@unique` for composite unique**

In `model Product`, change:

```prisma
  sku         String         @unique
```

to:

```prisma
  sku         String
```

and add to the index/constraint block (with the `@@index` lines):

```prisma
  @@unique([sku, sellerId])
```

- [ ] **Step 9: Generate the B5 migration (create-only)**

Run: `cd apps/api && npx prisma migrate dev --name product_sku_composite_unique --create-only`
Expected: SQL with `DROP INDEX "Product_sku_key";` and `CREATE UNIQUE INDEX "Product_sku_sellerId_key" ON "Product"("sku", "sellerId");`. One concern only.

- [ ] **Step 10: Apply the migration + regenerate client**

Run: `cd apps/api && npx prisma migrate dev`
Expected: applies cleanly; `prisma generate` regenerates the client (removing `sku` from `Product`'s `findUnique` where-type).

- [ ] **Step 11: Build the API — catch any remaining `findUnique({sku})` break**

Run: `cd apps/api && npm run build`
Expected: PASS. (Confirmed no `prisma.product.findUnique({where:{sku}})` call sites exist; the seed was the only `where:{sku}` site and was fixed in Step 7. If the build fails, grep `grep -rn "where: { sku" apps/api/src apps/api/prisma` and migrate each to `findFirst({ where: { sku, sellerId } })`.)

- [ ] **Step 12: Re-run the full API test suite**

Run: `cd apps/api && npm test`
Expected: all green (M0/M1 suite + the new sellerId assertion).

- [ ] **Step 13: Re-seed and smoke-verify the composite unique against `ecom_dev`**

Run: `cd apps/api && npx prisma db seed`
Expected: "Seed complete." (idempotent; products already exist → findFirst short-circuits).

Then prove the composite behavior directly:

```bash
# same SKU, two different sellers → allowed (needs a second seller row; create a throwaway one)
psql ecom_dev -c "INSERT INTO \"Seller\" (id,\"userId\",\"displayName\",slug,status,\"createdAt\",\"updatedAt\") VALUES ('tmp-seller','tmp-user-skip','Tmp','tmp-shop','ACTIVE',now(),now()) ON CONFLICT DO NOTHING;" 2>/dev/null || true
```

(If the FK on `userId` blocks the throwaway insert, skip the raw-SQL cross-seller check here and rely on the unit test + the slice-2 integration test for cross-seller SKU reuse. Do NOT leave a throwaway seller behind — `psql ecom_dev -c "DELETE FROM \"Seller\" WHERE id='tmp-seller';"`.)

Same-seller duplicate must still 409 — verify via HTTP in Step 14.

- [ ] **Step 14: Boot the API and HTTP-smoke create + dup-SKU**

Run (background): `cd apps/api && npm run start:dev`
Then, as ADMIN (obtain a token via `POST /auth/login` with `admin@example.com` / `Password123!`):

```bash
# create a product (owned by platform seller)
curl -s -X POST localhost:5000/products -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Widget","sku":"SMOKE-1","description":"x","price":9.99,"categoryId":"<phones-cat-id>"}'
# expect 201 with a sellerId on the returned product

# duplicate same SKU for the same (platform) seller → 409
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:5000/products -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Dup","sku":"SMOKE-1","description":"x","price":9.99,"categoryId":"<phones-cat-id>"}'
# expect 409
```

Expected: first call 201 (response includes `sellerId`), second call `409`. Stop the dev server after. Clean up the smoke product: `psql ecom_dev -c "DELETE FROM \"Product\" WHERE sku='SMOKE-1';"`.

- [ ] **Step 15: Lint**

Run: `cd apps/api && npm run lint`
Expected: clean (the lint script auto-fixes; ensure no unfixable errors remain).

- [ ] **Step 16: Commit (the breaking change + its fixes, atomically)**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/prisma/seed.ts \
        apps/api/src/products/platform-seller.ts apps/api/src/products/products.service.ts \
        apps/api/src/products/products.service.spec.ts
git commit -m "feat(m2)!: Product SKU unique per seller (B5) + create-path + seed fixes

BREAKING: Product.sku is no longer globally unique; uniqueness is now
(sku, sellerId). The platform/admin create-path owns products as the
Platform Seller. Ships with seed + products.service call-site fixes so
the build and seed stay green."
```

---

### Task 5: Update PLAN tracking + slice verification

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md` (M2 status → 🟡 In Progress, note slice 1 done)

- [ ] **Step 1: Run the full slice verification gate**

Use the `verify-slice` skill (test + lint + build for `apps/api`, working-tree-clean, no stray worktree).
Expected: PASS.

- [ ] **Step 2: Flip M2 status to In Progress in the roadmap**

In `docs/IMPLEMENTATION_PLAN.md`, change the M2 row in the status table from `⬜` to `🟡` and append a short note: "slice 1 (ownership migration B1–B5 + call-site fixes) done & smoke-verified vs `ecom_dev`; next: slice 2 service-layer scoping."

- [ ] **Step 3: Commit the tracker update**

```bash
git add docs/IMPLEMENTATION_PLAN.md
git commit -m "docs(m2): mark slice 1 (ownership migration) done; M2 in progress"
```

- [ ] **Step 4: STOP and ask the user to verify (RULE.md §1)**

Slice 1 is an independently-verifiable stopping point. Summarize what changed, the files touched, and the smoke results; ask the user to verify before starting slice 2 (service-layer ownership scoping). Do not push (RULE.md §3).

---

## Self-Review

**Spec coverage (against `2026-06-22-m2-seller-system-design.md`):**
- §Slice 1 migration files B1→B5 → Tasks 1–4. ✓
- "ship B5 with call-site fixes in one slice" → Task 4 (service + seed + spec, single commit). ✓
- The under-documented third break site (seed's `where:{sku}` upsert) → Task 4 Step 7. ✓
- "admin create-path = Platform Seller" → Task 4 Steps 3–4 (`resolvePlatformSellerId`). ✓
- Post-backfill row-count assertion (B3 validation) → Task 2 Step 3. ✓
- TDD red→green for composite/sellerId behavior → Task 4 Steps 1–6. ✓
- Smoke vs `ecom_dev` (RULE.md §5) → Task 4 Steps 13–14. ✓
- Actor/per-request scoping, `buildSellerScope`, 404-on-cross-tenant → **deferred to slice 2** (out of this plan's scope by design; this slice only introduces the columns + default owner). ✓
- CSV / seller inventory / portal UI → later slices, separate plans. ✓

**Placeholder scan:** No TBD/TODO. The only conditional ("if build fails, grep…") is a genuine fallback with the exact command, not a placeholder — the primary path is asserted clean.

**Type consistency:** `resolvePlatformSellerId(prisma): Promise<string>` defined in Task 4 Step 3, consumed in Step 4. `PLATFORM_SELLER_SLUG = 'platform'` matches `seed.ts` slug. `makePrisma()` mock extended with `seller.findFirstOrThrow` (Step 1) matches the helper's call (Step 3). `create(dto)` signature unchanged this slice (actor param is slice 2).

**Note on `--create-only` then apply:** used throughout so the generated SQL is inspected before it touches `ecom_dev` — required for the enum/constraint discipline in `MIGRATION_PLAN §0`.
