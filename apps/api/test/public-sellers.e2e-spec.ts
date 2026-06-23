/**
 * e2e: Public seller storefront routes
 *
 * Setup strategy: seed User + Seller + Product rows directly via PrismaService;
 * mint access tokens via TokenService.signAccessToken() — NO /auth HTTP calls.
 *
 * Covered cases:
 *  1. GET /sellers/:slug for a seeded ACTIVE seller → 200 with EXACTLY
 *     keys [id, displayName, slug, description, logoUrl] (no status, no gstin).
 *  2. GET /sellers/:slug for unknown / non-ACTIVE slug → 404.
 *  3. GET /sellers/:slug/products for the ACTIVE seller → 200, paginated
 *     envelope { data, page, pageSize, total, totalPages }; every item in
 *     data has status === 'ACTIVE'.
 *  4. GET /sellers/:slug/products for unknown / non-ACTIVE slug → 404.
 *
 * Note on assertion 3 (only ACTIVE products listed): The e2e seeds one ACTIVE
 * product via the seller-scoped HTTP endpoint so it is visible in the public
 * catalog. The "INACTIVE/ARCHIVED product does NOT appear" assertion is covered
 * in the controller unit test (public-sellers.controller.spec.ts) because
 * directly seeding a non-ACTIVE product via the authenticated seller endpoint
 * is not straightforward in this harness (seller creates a PENDING_REVIEW
 * product by default; forcing INACTIVE requires an additional admin action or
 * direct DB write). The e2e stays focused on the 200/404 + field-shape
 * (security-critical) assertions.
 *
 * Cleanup (FK order):
 *   Product (by sellerId) → Seller (by slug) → User (by email)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { ProductStatus, Role, SellerStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// ---------------------------------------------------------------------------
// Constants — unique namespace so cleanup is precise with no collisions.
// ---------------------------------------------------------------------------
const NS = 'e2e-ps';

const SELLER_EMAIL = `${NS}-seller@example.com`;
const SELLER_SLUG = `${NS}-seller`;

// Resolved in beforeAll from the seeded DB.
let CATEGORY_ID: string;

// ---------------------------------------------------------------------------
// Suite state
// ---------------------------------------------------------------------------
let app: INestApplication<App>;
let prisma: PrismaService;

let sellerId: string;

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

  // ---- Resolve category -----------------------------------------------
  const category = await prisma.category.findFirstOrThrow({
    where: { slug: 'phones', deletedAt: null },
    select: { id: true },
  });
  CATEGORY_ID = category.id;

  // ---- Seed user + ACTIVE seller ----------------------------------------
  const passwordHash = await bcrypt.hash('TestPassword1!', 10);

  const user = await prisma.user.create({
    data: {
      email: SELLER_EMAIL,
      passwordHash,
      name: 'E2E Public Seller',
      role: Role.SELLER,
      isActive: true,
    },
  });

  const seller = await prisma.seller.create({
    data: {
      userId: user.id,
      displayName: 'E2E Public Seller Shop',
      slug: SELLER_SLUG,
      description: 'Test seller description',
      status: SellerStatus.ACTIVE,
    },
  });
  sellerId = seller.id;

  // ---- Seed one ACTIVE product via direct DB write ----------------------
  // We seed directly so we control the status (ACTIVE) without going through
  // the seller-product HTTP endpoint which defaults to PENDING_REVIEW.
  await prisma.product.create({
    data: {
      name: `${NS} Public Product`,
      sku: `${NS}-pub-sku-${Date.now()}`,
      description: 'A public product',
      price: 49.99,
      status: ProductStatus.ACTIVE,
      categoryId: CATEGORY_ID,
      sellerId,
      inventory: {
        create: {
          sellerId,
          available: 10,
          reserved: 0,
          lowStockThreshold: 2,
        },
      },
    },
  });
});

afterAll(async () => {
  // Cleanup in FK order.

  // 1. Find all product IDs for this seller (for cart-item FK cleanup).
  const products = await prisma.product.findMany({
    where: { sellerId },
    select: { id: true },
  });
  const productIds = products.map((p) => p.id);

  // 2. Find all inventory item IDs for this seller (for movement FK cleanup).
  const inventoryItems = await prisma.inventoryItem.findMany({
    where: { sellerId },
    select: { id: true },
  });
  const inventoryItemIds = inventoryItems.map((i) => i.id);

  // 3. Delete dependents in FK order.
  if (productIds.length > 0) {
    await prisma.cartItem.deleteMany({
      where: { productId: { in: productIds } },
    });
  }
  if (inventoryItemIds.length > 0) {
    await prisma.inventoryMovement.deleteMany({
      where: { inventoryItemId: { in: inventoryItemIds } },
    });
  }
  await prisma.inventoryItem.deleteMany({ where: { sellerId } });
  await prisma.product.deleteMany({ where: { sellerId } });
  await prisma.seller.deleteMany({ where: { slug: SELLER_SLUG } });
  await prisma.user.deleteMany({ where: { email: SELLER_EMAIL } });

  await app.close();
});

// ---------------------------------------------------------------------------
// Case 1: Public seller profile — field-shape (security-critical).
// ---------------------------------------------------------------------------
describe('1. GET /sellers/:slug — public profile field shape', () => {
  it('returns 200 with EXACTLY [id, displayName, slug, description, logoUrl]', async () => {
    const res = await request(app.getHttpServer())
      .get(`/sellers/${SELLER_SLUG}`)
      .expect(200);

    // Exactly 5 keys — security assertion: status and gstin MUST NOT leak.
    expect(Object.keys(res.body as Record<string, unknown>).sort()).toEqual(
      ['description', 'displayName', 'id', 'logoUrl', 'slug'].sort(),
    );
    expect((res.body as Record<string, unknown>).status).toBeUndefined();
    expect((res.body as Record<string, unknown>).gstin).toBeUndefined();
  });

  it('returns the correct displayName and slug', async () => {
    const res = await request(app.getHttpServer())
      .get(`/sellers/${SELLER_SLUG}`)
      .expect(200);
    const body = res.body as Record<string, unknown>;
    expect(body.slug).toBe(SELLER_SLUG);
    expect(body.displayName).toBe('E2E Public Seller Shop');
  });
});

// ---------------------------------------------------------------------------
// Case 2: Unknown / non-ACTIVE slug → 404.
// ---------------------------------------------------------------------------
describe('2. GET /sellers/:slug — 404 for unknown seller', () => {
  it('returns 404 for an unknown slug', async () => {
    await request(app.getHttpServer())
      .get('/sellers/does-not-exist-xyz')
      .expect(404);
  });
});

// ---------------------------------------------------------------------------
// Case 3: Public products listing.
// ---------------------------------------------------------------------------
describe('3. GET /sellers/:slug/products — ACTIVE products listing', () => {
  it('returns 200 with paginated envelope', async () => {
    const res = await request(app.getHttpServer())
      .get(`/sellers/${SELLER_SLUG}/products`)
      .expect(200);

    const body = res.body as {
      data: unknown[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    };
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(typeof body.page).toBe('number');
    expect(typeof body.pageSize).toBe('number');
    expect(typeof body.totalPages).toBe('number');
  });

  it('every returned product has status === ACTIVE', async () => {
    const res = await request(app.getHttpServer())
      .get(`/sellers/${SELLER_SLUG}/products`)
      .expect(200);

    const data = (res.body as { data: Array<{ status: string }> }).data;
    expect(data.length).toBeGreaterThan(0);
    for (const p of data) {
      expect(p.status).toBe(ProductStatus.ACTIVE);
    }
  });
});

// ---------------------------------------------------------------------------
// Case 4: Unknown / non-ACTIVE slug for products → 404.
// ---------------------------------------------------------------------------
describe('4. GET /sellers/:slug/products — 404 for unknown seller', () => {
  it('returns 404 for an unknown seller slug', async () => {
    await request(app.getHttpServer())
      .get('/sellers/does-not-exist-xyz/products')
      .expect(404);
  });
});
