/**
 * e2e: Seller product isolation
 *
 * Setup strategy: seed User + Seller rows directly via PrismaService; mint
 * access tokens via TokenService.signAccessToken() — NO /auth HTTP calls.
 * This avoids the tight 10-req/60 s throttle on /auth/* and /seller/register.
 *
 * Covered cases:
 *  1. Seller A creates a product (201) and can GET it (200).
 *  2. Seller B reading A's product → 404 (cross-tenant isolation, not 403).
 *  3. Seller B patching A's product → 404.
 *  4. GET /seller/products list scoping: A sees only A's; B sees only B's.
 *  5. Non-seller (CUSTOMER) → 403; no token → 401.
 *  6. Public GET /products → 200 (admin surface intact).
 *  7. Same SKU across different sellers → 201 + 201 (@@unique([sku,sellerId]));
 *     same SKU re-used by same seller → 409.
 *
 * Cleanup: delete Products → Sellers → Users (FK order).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { Role, SellerStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/auth/token.service';

// ---------------------------------------------------------------------------
// Constants — unique namespace so cleanup is precise and no collisions occur.
// ---------------------------------------------------------------------------
const NS = 'e2e-sp';

const SELLER_A_EMAIL = `${NS}-seller-a@example.com`;
const SELLER_B_EMAIL = `${NS}-seller-b@example.com`;
const CUSTOMER_EMAIL = `${NS}-customer@example.com`;

const SELLER_A_SLUG = `${NS}-seller-a`;
const SELLER_B_SLUG = `${NS}-seller-b`;

// A real-ish category that exists in ecom_dev after seeding (slug: 'phones').
// We fetch the actual id in beforeAll so the test is seed-independent.
let CATEGORY_ID: string;

// ---------------------------------------------------------------------------
// Suite state
// ---------------------------------------------------------------------------
let app: INestApplication<App>;
let prisma: PrismaService;
let tokenService: TokenService;

let tokenA: string;
let tokenB: string;
let tokenCustomer: string;

let sellerAId: string; // Seller row id (not user id)
let sellerBId: string;

// Products created during the test (tracked for cleanup).
const createdProductIds: string[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch a valid bearer header string. */
const auth = (token: string) => `Bearer ${token}`;

/** Extract a field from an unknown supertest body without unsafe member access. */
function bodyField<T>(body: unknown, field: string): T {
  return (body as Record<string, unknown>)[field] as T;
}

/** Extract `.data` from a paginated list body. */
function bodyData(body: unknown): Array<{ id: string }> {
  return (body as Record<string, unknown>).data as Array<{ id: string }>;
}

/** A minimal valid product payload for POST /seller/products. */
const productPayload = (
  overrides: Partial<{
    name: string;
    sku: string;
    description: string;
    price: number;
  }> = {},
) => ({
  name: `${NS} Product`,
  sku: `${NS}-sku-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  description: 'Test product description',
  price: 99.99,
  categoryId: CATEGORY_ID,
  ...overrides,
});

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
  const category = await prisma.category.findFirstOrThrow({
    where: { slug: 'phones', deletedAt: null },
    select: { id: true },
  });
  CATEGORY_ID = category.id;

  // ---- Seed users + sellers -------------------------------------------
  const passwordHash = await bcrypt.hash('TestPassword1!', 10);

  // Seller A — SELLER role, ACTIVE seller row
  const userA = await prisma.user.create({
    data: {
      email: SELLER_A_EMAIL,
      passwordHash,
      name: 'E2E Seller A',
      role: Role.SELLER,
      isActive: true,
    },
  });
  const sellerA = await prisma.seller.create({
    data: {
      userId: userA.id,
      displayName: 'E2E Seller A Shop',
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
      name: 'E2E Seller B',
      role: Role.SELLER,
      isActive: true,
    },
  });
  const sellerB = await prisma.seller.create({
    data: {
      userId: userB.id,
      displayName: 'E2E Seller B Shop',
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
      name: 'E2E Customer',
      role: Role.CUSTOMER,
      isActive: true,
    },
  });

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
  // Cleanup in FK order: Products → Sellers → Users.
  if (createdProductIds.length > 0) {
    await prisma.product.deleteMany({
      where: { id: { in: createdProductIds } },
    });
  }

  // Remove any products belonging to our test sellers that weren't tracked
  // (e.g. from the per-SKU uniqueness test branch).
  await prisma.product.deleteMany({
    where: { sellerId: { in: [sellerAId, sellerBId] } },
  });

  await prisma.seller.deleteMany({
    where: { slug: { in: [SELLER_A_SLUG, SELLER_B_SLUG] } },
  });

  await prisma.user.deleteMany({
    where: {
      email: { in: [SELLER_A_EMAIL, SELLER_B_EMAIL, CUSTOMER_EMAIL] },
    },
  });

  await app.close();
});

// ---------------------------------------------------------------------------
// Case 1: Seller A creates a product and can read it back.
// ---------------------------------------------------------------------------
describe('1. Seller A CRUD on own product', () => {
  let productAId: string;

  it('POST /seller/products as Seller A → 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/seller/products')
      .set('Authorization', auth(tokenA))
      .send(productPayload({ name: 'Seller A Product', sku: `${NS}-sku-A-1` }))
      .expect(201);

    expect(res.body).toHaveProperty('id');
    productAId = bodyField<string>(res.body, 'id');
    createdProductIds.push(productAId);
  });

  it('GET /seller/products/:id as Seller A → 200', async () => {
    await request(app.getHttpServer())
      .get(`/seller/products/${productAId}`)
      .set('Authorization', auth(tokenA))
      .expect(200);
  });

  // ---- Case 2: Seller B cannot read A's product ----
  it('GET /seller/products/:id as Seller B → 404 (cross-tenant isolation)', async () => {
    await request(app.getHttpServer())
      .get(`/seller/products/${productAId}`)
      .set('Authorization', auth(tokenB))
      .expect(404);
  });

  // ---- Case 3: Seller B cannot patch A's product ----
  it('PATCH /seller/products/:id as Seller B → 404', async () => {
    await request(app.getHttpServer())
      .patch(`/seller/products/${productAId}`)
      .set('Authorization', auth(tokenB))
      .send({ name: 'Hijacked Name' })
      .expect(404);
  });
});

// ---------------------------------------------------------------------------
// Case 4: List scoping — each seller sees only their own products.
// ---------------------------------------------------------------------------
describe('4. GET /seller/products list scoping', () => {
  let productAListId: string;
  let productBListId: string;

  beforeAll(async () => {
    // Create one product per seller.
    const resA = await request(app.getHttpServer())
      .post('/seller/products')
      .set('Authorization', auth(tokenA))
      .send(
        productPayload({ name: 'Seller A List Product', sku: `${NS}-list-A` }),
      )
      .expect(201);
    productAListId = bodyField<string>(resA.body, 'id');
    createdProductIds.push(productAListId);

    const resB = await request(app.getHttpServer())
      .post('/seller/products')
      .set('Authorization', auth(tokenB))
      .send(
        productPayload({ name: 'Seller B List Product', sku: `${NS}-list-B` }),
      )
      .expect(201);
    productBListId = bodyField<string>(resB.body, 'id');
    createdProductIds.push(productBListId);
  });

  it("Seller A's list contains A's product and NOT B's", async () => {
    const res = await request(app.getHttpServer())
      .get('/seller/products')
      .set('Authorization', auth(tokenA))
      .expect(200);

    const ids: string[] = bodyData(res.body).map((p) => p.id);
    expect(ids).toContain(productAListId);
    expect(ids).not.toContain(productBListId);
  });

  it("Seller B's list contains B's product and NOT A's", async () => {
    const res = await request(app.getHttpServer())
      .get('/seller/products')
      .set('Authorization', auth(tokenB))
      .expect(200);

    const ids: string[] = bodyData(res.body).map((p) => p.id);
    expect(ids).toContain(productBListId);
    expect(ids).not.toContain(productAListId);
  });
});

// ---------------------------------------------------------------------------
// Case 5: Non-seller blocked.
// ---------------------------------------------------------------------------
describe('5. Non-seller / unauthenticated access', () => {
  it('GET /seller/products with CUSTOMER token → 403', async () => {
    await request(app.getHttpServer())
      .get('/seller/products')
      .set('Authorization', auth(tokenCustomer))
      .expect(403);
  });

  it('GET /seller/products with no Authorization header → 401', async () => {
    await request(app.getHttpServer()).get('/seller/products').expect(401);
  });
});

// ---------------------------------------------------------------------------
// Case 6: Admin/public surface still works.
// ---------------------------------------------------------------------------
describe('6. Public product catalog surface intact', () => {
  it('GET /products (public) → 200', async () => {
    await request(app.getHttpServer()).get('/products').expect(200);
  });
});

// ---------------------------------------------------------------------------
// Case 7 (optional): Per-seller SKU uniqueness via @@unique([sku, sellerId]).
// ---------------------------------------------------------------------------
describe('7. Per-seller SKU uniqueness', () => {
  const SHARED_SKU = `${NS}-shared-sku-${Date.now()}`;

  it('Seller A creates product with SKU X → 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/seller/products')
      .set('Authorization', auth(tokenA))
      .send(productPayload({ name: 'SKU Test A', sku: SHARED_SKU }))
      .expect(201);
    createdProductIds.push(bodyField<string>(res.body, 'id'));
  });

  it('Seller B creates product with the SAME SKU X → 201 (cross-seller allowed)', async () => {
    const res = await request(app.getHttpServer())
      .post('/seller/products')
      .set('Authorization', auth(tokenB))
      .send(productPayload({ name: 'SKU Test B', sku: SHARED_SKU }))
      .expect(201);
    createdProductIds.push(bodyField<string>(res.body, 'id'));
  });

  it('Seller A re-uses their OWN SKU X → 409', async () => {
    await request(app.getHttpServer())
      .post('/seller/products')
      .set('Authorization', auth(tokenA))
      .send(productPayload({ name: 'SKU Dupe A', sku: SHARED_SKU }))
      .expect(409);
  });
});
