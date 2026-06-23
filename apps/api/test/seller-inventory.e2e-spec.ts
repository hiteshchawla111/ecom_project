/**
 * e2e: Seller inventory isolation + manual movements
 *
 * Setup strategy: seed User + Seller + Product + InventoryItem rows directly
 * via PrismaService; mint access tokens via TokenService.signAccessToken()
 * — NO /auth HTTP calls (avoids the tight 10-req/60 s throttle).
 *
 * Covered cases:
 *  1. GET /seller/inventory as Seller A → 200; includes A's stock row, NOT B's.
 *  2. GET /seller/inventory/:productId (A's product) as A → 200.
 *  3. GET /seller/inventory/:productId (A's product) as Seller B → 404
 *     (cross-tenant isolation; B is a valid ACTIVE seller, so it is the
 *      service-layer scope that rejects, not the guard → 404, not 403).
 *  4. POST /seller/inventory/:productId/movements as A (ADDITION +5) → 204;
 *     then GET detail confirms available went from 20 to 25.
 *  5. POST /seller/inventory/:productId/movements (A's product) as Seller B
 *     → 404 (cross-tenant write).
 *  6. GET /seller/inventory with CUSTOMER token → 403; no Authorization → 401.
 *  7. (Optional) Low-stock notification: drive A's available below
 *     lowStockThreshold via DEDUCTION; assert a LOW_STOCK Notification row
 *     exists with userId = Seller A's user id.
 *
 * Cleanup (FK order):
 *   AuditLog (by entityId = productIds) →
 *   InventoryMovement (by inventoryItemId) →
 *   InventoryItem (by sellerId in [A,B]) →
 *   Product (by sellerId in [A,B]) →
 *   Notification (LOW_STOCK by userId in test users) →
 *   Seller (by slug namespace) →
 *   User (by email namespace)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { NotificationType, Role, SellerStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/auth/token.service';

// ---------------------------------------------------------------------------
// Constants — unique namespace so cleanup is precise and no collisions occur.
// ---------------------------------------------------------------------------
const NS = 'e2e-si';

const SELLER_A_EMAIL = `${NS}-seller-a@example.com`;
const SELLER_B_EMAIL = `${NS}-seller-b@example.com`;
const CUSTOMER_EMAIL = `${NS}-customer@example.com`;

const SELLER_A_SLUG = `${NS}-seller-a`;
const SELLER_B_SLUG = `${NS}-seller-b`;

/** Starting available stock for both sellers (before any test mutations). */
const INITIAL_AVAILABLE = 20;
/** Low-stock threshold — triggers a LOW_STOCK event when available crosses below. */
const LOW_STOCK_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Suite state
// ---------------------------------------------------------------------------
let app: INestApplication<App>;
let prisma: PrismaService;
let tokenService: TokenService;

let tokenA: string;
let tokenB: string;
let tokenCustomer: string;

let userAId: string;
let userBId: string;
let sellerAId: string;
let sellerBId: string;

let productAId: string;
let productBId: string;

let inventoryItemAId: string;
let inventoryItemBId: string;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a Bearer Authorization header value. */
const auth = (token: string) => `Bearer ${token}`;

/** Extract a field from an unknown supertest body without unsafe member access. */
function bodyField<T>(body: unknown, field: string): T {
  return (body as Record<string, unknown>)[field] as T;
}

/** Extract `.data` from a paginated list body. */
function bodyData(body: unknown): Array<Record<string, unknown>> {
  return (body as Record<string, unknown>).data as Array<
    Record<string, unknown>
  >;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  // Mirror main.ts: apply the global ValidationPipe so DTOs are validated.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  prisma = app.get(PrismaService);
  tokenService = app.get(TokenService);

  // ---- Resolve category -----------------------------------------------
  // Fetch a valid category from the seeded data (slug: 'phones').
  const category = await prisma.category.findFirstOrThrow({
    where: { slug: 'phones', deletedAt: null },
    select: { id: true },
  });
  const categoryId = category.id;

  // ---- Seed users + sellers -------------------------------------------
  const passwordHash = await bcrypt.hash('TestPassword1!', 10);

  // Seller A — SELLER role, ACTIVE seller row
  const userA = await prisma.user.create({
    data: {
      email: SELLER_A_EMAIL,
      passwordHash,
      name: 'E2E Inventory Seller A',
      role: Role.SELLER,
      isActive: true,
    },
  });
  userAId = userA.id;

  const sellerA = await prisma.seller.create({
    data: {
      userId: userA.id,
      displayName: 'E2E Inventory Seller A Shop',
      slug: SELLER_A_SLUG,
      status: SellerStatus.ACTIVE,
    },
  });
  sellerAId = sellerA.id;

  // Seller B — SELLER role, ACTIVE seller row
  const userB = await prisma.user.create({
    data: {
      email: SELLER_B_EMAIL,
      passwordHash,
      name: 'E2E Inventory Seller B',
      role: Role.SELLER,
      isActive: true,
    },
  });
  userBId = userB.id;

  const sellerB = await prisma.seller.create({
    data: {
      userId: userB.id,
      displayName: 'E2E Inventory Seller B Shop',
      slug: SELLER_B_SLUG,
      status: SellerStatus.ACTIVE,
    },
  });
  sellerBId = sellerB.id;

  // Customer — no seller row; used to test 403 path
  const userC = await prisma.user.create({
    data: {
      email: CUSTOMER_EMAIL,
      passwordHash,
      name: 'E2E Inventory Customer',
      role: Role.CUSTOMER,
      isActive: true,
    },
  });

  // ---- Seed products + inventory items per seller ---------------------
  // Seller A product + inventory
  const productA = await prisma.product.create({
    data: {
      name: `${NS} Product A`,
      sku: `${NS}-sku-a`,
      description: 'Test inventory product for Seller A',
      price: 49.99,
      categoryId,
      sellerId: sellerA.id,
    },
  });
  productAId = productA.id;

  const inventoryItemA = await prisma.inventoryItem.create({
    data: {
      productId: productA.id,
      sellerId: sellerA.id,
      available: INITIAL_AVAILABLE,
      reserved: 0,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
    },
  });
  inventoryItemAId = inventoryItemA.id;

  // Seller B product + inventory
  const productB = await prisma.product.create({
    data: {
      name: `${NS} Product B`,
      sku: `${NS}-sku-b`,
      description: 'Test inventory product for Seller B',
      price: 29.99,
      categoryId,
      sellerId: sellerB.id,
    },
  });
  productBId = productB.id;

  const inventoryItemB = await prisma.inventoryItem.create({
    data: {
      productId: productB.id,
      sellerId: sellerB.id,
      available: INITIAL_AVAILABLE,
      reserved: 0,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
    },
  });
  inventoryItemBId = inventoryItemB.id;

  // ---- Mint tokens (no HTTP calls) ------------------------------------
  tokenA = await tokenService.signAccessToken({
    sub: userA.id,
    email: userA.email,
    role: Role.SELLER,
  });
  tokenB = await tokenService.signAccessToken({
    sub: userB.id,
    email: userB.email,
    role: Role.SELLER,
  });
  tokenCustomer = await tokenService.signAccessToken({
    sub: userC.id,
    email: userC.email,
    role: Role.CUSTOMER,
  });
});

afterAll(async () => {
  // Cleanup in FK order: movements → items → audit logs → products → notifications → sellers → users.

  // 1. Delete InventoryMovement rows tied to our test inventory items.
  await prisma.inventoryMovement.deleteMany({
    where: {
      inventoryItemId: { in: [inventoryItemAId, inventoryItemBId] },
    },
  });

  // 2. Delete InventoryItem rows for our test sellers.
  await prisma.inventoryItem.deleteMany({
    where: { sellerId: { in: [sellerAId, sellerBId] } },
  });

  // 3. Delete AuditLog rows that reference our test products (entityId = productId).
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [productAId, productBId] } },
  });

  // 4. Delete Product rows for our test sellers.
  await prisma.product.deleteMany({
    where: { sellerId: { in: [sellerAId, sellerBId] } },
  });

  // 5. Delete LOW_STOCK notifications created by case 7.
  await prisma.notification.deleteMany({
    where: {
      type: NotificationType.LOW_STOCK,
      userId: { in: [userAId, userBId] },
    },
  });

  // 6. Delete the staff-queue (userId: null) LOW_STOCK notifications for our products.
  await prisma.notification.deleteMany({
    where: {
      type: NotificationType.LOW_STOCK,
      userId: null,
      payload: {
        path: ['productId'],
        equals: productAId,
      },
    },
  });

  // 7. Delete Seller rows.
  await prisma.seller.deleteMany({
    where: { slug: { in: [SELLER_A_SLUG, SELLER_B_SLUG] } },
  });

  // 8. Delete User rows.
  await prisma.user.deleteMany({
    where: {
      email: { in: [SELLER_A_EMAIL, SELLER_B_EMAIL, CUSTOMER_EMAIL] },
    },
  });

  await app.close();
});

// ---------------------------------------------------------------------------
// Case 1: Own stock list — Seller A sees their product, NOT B's.
// ---------------------------------------------------------------------------
describe('1. GET /seller/inventory list scoping', () => {
  it("Seller A's stock list includes A's product and excludes B's", async () => {
    const res = await request(app.getHttpServer())
      .get('/seller/inventory')
      .query({ pageSize: 100 })
      .set('Authorization', auth(tokenA))
      .expect(200);

    const rows = bodyData(res.body);
    const productIds = rows.map((r) => bodyField<string>(r, 'productId'));

    expect(productIds).toContain(productAId);
    expect(productIds).not.toContain(productBId);
  });

  it("Seller B's stock list includes B's product and excludes A's", async () => {
    const res = await request(app.getHttpServer())
      .get('/seller/inventory')
      .query({ pageSize: 100 })
      .set('Authorization', auth(tokenB))
      .expect(200);

    const rows = bodyData(res.body);
    const productIds = rows.map((r) => bodyField<string>(r, 'productId'));

    expect(productIds).toContain(productBId);
    expect(productIds).not.toContain(productAId);
  });
});

// ---------------------------------------------------------------------------
// Case 2: Own stock detail — Seller A can read their own product's stock.
// ---------------------------------------------------------------------------
describe('2. GET /seller/inventory/:productId (own product)', () => {
  it('Seller A reads own product stock detail → 200', async () => {
    const res = await request(app.getHttpServer())
      .get(`/seller/inventory/${productAId}`)
      .set('Authorization', auth(tokenA))
      .expect(200);

    expect(bodyField<string>(res.body, 'productId')).toBe(productAId);
    expect(bodyField<number>(res.body, 'available')).toBe(INITIAL_AVAILABLE);
  });
});

// ---------------------------------------------------------------------------
// Case 3: Cross-tenant detail → 404.
//   Seller B is a valid ACTIVE seller, so SellerApprovedGuard passes; the
//   404 is from the service-layer scope (buildSellerScope filters by sellerId).
// ---------------------------------------------------------------------------
describe('3. GET /seller/inventory/:productId cross-tenant → 404', () => {
  it("Seller B reads A's product stock detail → 404 (not 403)", async () => {
    await request(app.getHttpServer())
      .get(`/seller/inventory/${productAId}`)
      .set('Authorization', auth(tokenB))
      .expect(404);
  });
});

// ---------------------------------------------------------------------------
// Case 4: Post movement to own product; confirm available delta.
// ---------------------------------------------------------------------------
describe('4. POST /seller/inventory/:productId/movements (own product)', () => {
  it('Seller A posts ADDITION +5 → 204', async () => {
    await request(app.getHttpServer())
      .post(`/seller/inventory/${productAId}/movements`)
      .set('Authorization', auth(tokenA))
      .send({ type: 'ADDITION', quantity: 5, reason: 'restock' })
      .expect(204);
  });

  it('GET detail after ADDITION shows available = 25 (20 + 5)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/seller/inventory/${productAId}`)
      .set('Authorization', auth(tokenA))
      .expect(200);

    expect(bodyField<number>(res.body, 'available')).toBe(
      INITIAL_AVAILABLE + 5,
    );
  });
});

// ---------------------------------------------------------------------------
// Case 5: Cross-tenant movement → 404.
// ---------------------------------------------------------------------------
describe("5. POST movement on A's product as Seller B → 404", () => {
  it('Seller B cannot post a movement on A product → 404', async () => {
    await request(app.getHttpServer())
      .post(`/seller/inventory/${productAId}/movements`)
      .set('Authorization', auth(tokenB))
      .send({ type: 'ADDITION', quantity: 1, reason: 'hijack attempt' })
      .expect(404);
  });
});

// ---------------------------------------------------------------------------
// Case 6: Non-seller 403; no Authorization header 401.
// ---------------------------------------------------------------------------
describe('6. Non-seller / unauthenticated access', () => {
  it('GET /seller/inventory with CUSTOMER token → 403', async () => {
    await request(app.getHttpServer())
      .get('/seller/inventory')
      .set('Authorization', auth(tokenCustomer))
      .expect(403);
  });

  it('GET /seller/inventory with no Authorization header → 401', async () => {
    await request(app.getHttpServer()).get('/seller/inventory').expect(401);
  });
});

// ---------------------------------------------------------------------------
// Case 7 (optional): Low-stock notification via owning-seller DEDUCTION.
//   After case 4, A's available is 25. Deduct 21 to bring it to 4 (<= 5
//   threshold), triggering the LOW_STOCK event → LowStockListener writes
//   a Notification row with userId = userAId.
// ---------------------------------------------------------------------------
describe('7. Low-stock notification via DEDUCTION below threshold', () => {
  it('Seller A posts DEDUCTION that crosses threshold → LOW_STOCK notification exists', async () => {
    // After case 4: available = 25. Deduct 21 → available = 4 (below threshold of 5).
    await request(app.getHttpServer())
      .post(`/seller/inventory/${productAId}/movements`)
      .set('Authorization', auth(tokenA))
      .send({ type: 'DEDUCTION', quantity: 21, reason: 'stock write-off' })
      .expect(204);

    // The LowStockListener handles the event asynchronously but within the
    // same process/event loop. A brief wait lets the async handler complete.
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    // Assert a LOW_STOCK notification row was created for the owning seller.
    const notification = await prisma.notification.findFirst({
      where: {
        type: NotificationType.LOW_STOCK,
        userId: userAId,
      },
    });

    expect(notification).not.toBeNull();
    expect(notification?.userId).toBe(userAId);
  }, 10_000);
});
