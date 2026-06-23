# M2 Slice 6f — Create InventoryItem on Product Create Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a product is created (seller or admin/platform path), atomically create its `InventoryItem` (seller-owned, zero stock) so the product is immediately visible and adjustable in the seller "My Inventory" flow — closing the M-1 gap the M2 whole-branch review found.

**Architecture:** `ProductsService.create` currently does a single `product.create`. Change it to a Prisma **nested write** — `product.create({ data: { ..., inventory: { create: { sellerId, available: 0, reserved: 0, lowStockThreshold: <default> } } } })` — which Prisma runs atomically (the product + its inventory item commit together or not at all). `InventoryItem.sellerId` is copied from the product's `sellerId` (consistency the scope filters rely on). No new endpoint; the create path just provisions stock.

**Tech Stack:** NestJS + Prisma 7, Jest. Domain-critical (inventory ledger + atomicity) → TDD.

## Global Constraints

- The `InventoryItem` MUST be created in the SAME atomic operation as the product (Prisma nested `create` is atomic by default — a failure rolls back both; do NOT do two separate awaited creates that could leave a product with no inventory row).
- `InventoryItem.sellerId` MUST equal the product's `sellerId` (the inventory scope filters on `InventoryItem.sellerId`; a mismatch would break seller isolation/visibility). Copy it from the resolved `sellerId`.
- New inventory item defaults: `available: 0`, `reserved: 0`, `lowStockThreshold: 0` (matches the Prisma schema defaults — a product starts with no stock until the seller posts an ADDITION; threshold 0 = no low-stock alert until configured). Confirm the schema's defaults and use them explicitly.
- `InventoryItem.productId` is `@unique` (one item per product) — the nested create establishes exactly one.
- Existing `create` behavior preserved: sellerId resolution (seller actor → own; else platform seller), the P2002→409 dup-SKU mapping, the returned `Product` shape. The dup-SKU path must still 409 and must NOT leave an orphan inventory row (atomicity handles this — a P2002 on the product rolls back the whole nested write).
- Strict TS, no `any`. Verify with `npx tsc -p tsconfig.build.json --noEmit` (0 errors) + boot smoke (not nest-build exit).
- No `git push` without explicit permission (RULE.md §3). Branch: `feat/seller-system`.

## File Structure

- `apps/api/src/products/products.service.ts` (modify) — `create` does a nested `inventory: { create: {...} }`.
- `apps/api/src/products/products.service.spec.ts` (modify) — assert the create nests an inventory item with the right sellerId + zero defaults; dup-SKU still 409.

---

### Task 1: create() provisions an InventoryItem atomically

**Files:**
- Modify: `apps/api/src/products/products.service.ts`
- Modify: `apps/api/src/products/products.service.spec.ts`

**Interfaces:**
- Produces: `ProductsService.create(dto, actor)` now creates the product AND its `InventoryItem` (sellerId copied, available/reserved 0, lowStockThreshold 0) in one atomic Prisma nested write. Signature + return type unchanged (`Promise<Product>`).

- [ ] **Step 1: Confirm the InventoryItem schema defaults**

Read `apps/api/prisma/schema.prisma` `model InventoryItem`. Confirm `available Int @default(0)`, `reserved Int @default(0)`, `lowStockThreshold Int @default(0)`, `productId String @unique`, and `sellerId String` (NOT NULL, FK). The nested create will set `sellerId`, `available: 0`, `reserved: 0`, `lowStockThreshold: 0` explicitly (matching the defaults, but explicit for clarity in the create).

- [ ] **Step 2: Write the failing test**

In `apps/api/src/products/products.service.spec.ts`, add a test asserting the create nests an inventory item. The Prisma mock's `product.create` captures the `data` arg — assert it contains a nested `inventory.create` with the right shape:

```ts
it('provisions an InventoryItem (seller-owned, zero stock) atomically with the product', async () => {
  const { svc, prisma } = build();
  prisma.product.create.mockResolvedValue({ id: 'p1', ...baseCreate });

  await svc.create(baseCreate, SELLER_A); // SELLER_A = { role: SELLER, sellerId: 'seller-a' }

  const [createCall] = prisma.product.create.mock.calls as Array<
    [{ data: { sellerId?: string; inventory?: { create?: Record<string, unknown> } } }]
  >;
  const data = createCall[0].data;
  expect(data.sellerId).toBe('seller-a');
  expect(data.inventory?.create).toEqual({
    sellerId: 'seller-a',
    available: 0,
    reserved: 0,
    lowStockThreshold: 0,
  });
});
```

(Use the existing `SELLER_A`/`ADMIN` actor consts from the spec — slice 2 added them. The existing "sets a sellerId" + dup-SKU-409 tests stay and must still pass.)

- [ ] **Step 3: Run — verify it fails**

Run: `cd apps/api && npm test -- products.service`
Expected: FAIL — `create` doesn't nest an `inventory.create` yet (`data.inventory` is undefined).

- [ ] **Step 4: Implement the nested create**

In `apps/api/src/products/products.service.ts`, change `create` to nest the inventory item:

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
          // Provision the stock ledger row atomically — a product is immediately
          // manageable in inventory (zero stock until an ADDITION is posted).
          // sellerId mirrors the product's owner (the inventory scope filters on it).
          inventory: {
            create: {
              sellerId,
              available: 0,
              reserved: 0,
              lowStockThreshold: 0,
            },
          },
        },
      });
    } catch (err) {
      throw this.mapWriteError(err);
    }
  }
```

(The nested `inventory: { create: {...} }` is atomic — Prisma wraps the product + inventory insert in one transaction. A dup-SKU P2002 on the product rolls back the whole write, so no orphan inventory row. The `mapWriteError` P2002→409 path is unchanged.)

- [ ] **Step 5: Run — verify it passes**

Run: `cd apps/api && npm test -- products.service`
Expected: PASS — the new nested-inventory test + the existing sellerId + dup-SKU-409 tests.

- [ ] **Step 6: tsc + full suite + lint**

Run: `cd apps/api && npx tsc -p tsconfig.build.json --noEmit && npm test && npm run lint`
Expected: 0 tsc errors; full suite green; lint clean. (The nested create is valid against `Prisma.ProductCreateInput` — `inventory` is the relation field; tsc confirms.)

- [ ] **Step 7: Boot smoke — create a product then immediately read its inventory**

Run `npm run start:dev` (background); poll `localhost:5000/products` for 200. As the seeded seller (`seller@example.com` / `Password123!`):
```bash
TOK=$(curl -s -X POST localhost:5000/auth/login -H 'Content-Type: application/json' -d '{"email":"seller@example.com","password":"Password123!"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
CAT=$(curl -s localhost:5000/categories | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) else d['data'][0]['id'])")
PID=$(curl -s -X POST localhost:5000/seller/products -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "{\"name\":\"6f Smoke\",\"sku\":\"SMK6F-1\",\"description\":\"d\",\"price\":1,\"categoryId\":\"$CAT\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
# the headline: the just-created product's inventory is immediately readable (was 404 before this fix)
curl -s -o /dev/null -w "GET /seller/inventory/<new>: %{http_code}\n" "localhost:5000/seller/inventory/$PID" -H "Authorization: Bearer $TOK"
psql ecom_dev -tc "DELETE FROM \"InventoryItem\" WHERE \"productId\"='$PID'; DELETE FROM \"Product\" WHERE sku='SMK6F-1';" >/dev/null 2>&1
```
Expected: `GET /seller/inventory/<new>: 200` (before this fix it was 404). Stop the server; clean up (the psql above deletes the smoke product + its inventory).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/products/products.service.ts apps/api/src/products/products.service.spec.ts
git commit -m "fix(m2): provision InventoryItem on product create (atomic nested write)

A created product (seller or platform) now gets a zero-stock InventoryItem
in the same atomic write, so it's immediately manageable in seller inventory
(closes the M-1 gap from the M2 whole-branch review)."
```

---

### Task 2: Slice gate + tracker

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md`

- [ ] **Step 1: Full gate**

From `apps/api`: `npm test`, `npm run test:e2e`, `npx tsc -p tsconfig.build.json --noEmit` (0 errors), `npm run lint`. (No admin change this slice; a quick `cd apps/admin && npm run build` is optional sanity.) Repo root: `git status --porcelain` clean.
Expected: all green.

- [ ] **Step 2: Confirm the seed still works (it pre-creates inventory explicitly)**

Run: `cd apps/api && npx prisma db seed`
Expected: "Seed complete." — the seed creates products via `product.create` (not the service) and already creates InventoryItems explicitly, so it's unaffected. Confirm no duplicate-inventory error (the seed's products are findFirst-guarded; its inventory is count-guarded).

- [ ] **Step 3: Update tracker**

In `docs/IMPLEMENTATION_PLAN.md`, append to the M2 row: "6f: product create now provisions its InventoryItem atomically (closes the whole-branch-review M-1 gap — seller-created products are immediately stock-manageable)."

- [ ] **Step 4: Commit**

```bash
git add docs/IMPLEMENTATION_PLAN.md
git commit -m "docs(m2): note slice 6f (inventory-on-product-create) — closes M-1"
```

- [ ] **Step 5: STOP — M2 truly complete**

This closes the last M2 finding. Hand back to the phase-completion flow (the RULE.md §6 resume prompt). Do not push.

---

## Self-Review

**Spec coverage:** the M-1 finding (product create doesn't provision inventory) → Task 1 (atomic nested create). ✓

**Placeholder scan:** No TBD/TODO. Step 1 confirms the schema defaults before relying on them; the nested-create code + test are given in full.

**Type consistency:** the nested `inventory: { create: { sellerId, available, reserved, lowStockThreshold } }` is a `Prisma.ProductCreateInput` relation write — tsc validates it (Step 6). `InventoryItem.sellerId` = the product's `sellerId` (same resolved value). `create`'s signature + `Promise<Product>` return unchanged.

**Atomicity note:** Prisma's nested `create` within a single `product.create` is one transaction — product + inventory commit together; a P2002 dup-SKU rolls back both (no orphan inventory). This is the key correctness property and why it's a nested write, not two awaited creates.

**Why threshold 0:** matches the schema default; a new product has no low-stock alert until the seller sets a threshold via an ADJUSTMENT/config (the existing inventory flow). Not inventing a non-zero default.
