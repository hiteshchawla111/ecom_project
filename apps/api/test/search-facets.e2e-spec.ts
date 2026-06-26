/**
 * e2e: faceted search counts (disjunctive) against seeded fixtures.
 * Shared ecom_dev has all-NULL ratings + messy brands, so this seeds its own
 * deterministic data in a unique namespace and cleans up (FK order) after.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ProductStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const NS = 'e2e-facets';

describe('faceted search (disjunctive counts)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let categoryId: string;
  let sellerId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    // A seller that already owns products (reuse — avoids KYC/seller setup here).
    const seller = await prisma.seller.findFirstOrThrow({
      where: { products: { some: {} } },
    });
    sellerId = seller.id;
    const category = await prisma.category.create({
      data: { name: `${NS}-cat`, slug: `${NS}-cat` },
    });
    categoryId = category.id;

    // 3 brands; all share the unique token NS so the text query isolates them.
    // AcmeFx×2, BetaFx×1, GammaFx×1 — distinct prices + ratings (Gamma unrated).
    const rows = [
      { sku: `${NS}-1`, brand: 'AcmeFx', price: '100.00', ratingAvg: '4.5' },
      { sku: `${NS}-2`, brand: 'AcmeFx', price: '200.00', ratingAvg: '3.5' },
      { sku: `${NS}-3`, brand: 'BetaFx', price: '300.00', ratingAvg: '4.0' },
      { sku: `${NS}-4`, brand: 'GammaFx', price: '400.00', ratingAvg: null },
    ];
    for (const r of rows) {
      await prisma.product.create({
        data: {
          sku: r.sku,
          name: `${NS} widget`,
          description: 'facet fixture',
          brand: r.brand,
          price: r.price,
          ratingAvg: r.ratingAvg ?? undefined,
          status: ProductStatus.ACTIVE,
          categoryId,
          sellerId,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { sku: { startsWith: NS } } });
    await prisma.category.deleteMany({ where: { slug: `${NS}-cat` } });
    await app.close();
  });

  interface FacetBody {
    total: number;
    facets: {
      brands: Array<{ value: string; count: number }>;
      categories: Array<{ categoryId: string; count: number }>;
      price: { min: string; max: string } | null;
      ratings: Array<{ minRating: number; count: number }>;
    };
  }

  const search = (qs: string) =>
    request(app.getHttpServer()).get(`/products/search?q=${NS}+widget&${qs}`);

  it('brand facet lists all 3 brands with disjunctive counts when brand is filtered', async () => {
    // Filter brand=AcmeFx; the brand facet should STILL show Beta/Gamma (disjunctive).
    const res = await search('brand=AcmeFx');
    expect(res.status).toBe(200);
    const body = res.body as FacetBody;
    const byBrand = Object.fromEntries(
      body.facets.brands.map((b) => [b.value, b.count]),
    );
    expect(byBrand.AcmeFx).toBe(2);
    expect(byBrand.BetaFx).toBe(1);
    expect(byBrand.GammaFx).toBe(1);
    // Results themselves are narrowed to AcmeFx.
    expect(body.total).toBe(2);
  });

  it('category facet count honors the active brand filter (disjunctive only drops own facet)', async () => {
    const res = await search('brand=AcmeFx');
    const cat = (res.body as FacetBody).facets.categories.find(
      (c) => c.categoryId === categoryId,
    );
    expect(cat?.count).toBe(2); // only AcmeFx products in this category
  });

  it('price facet returns min/max over the (price-omitted) set', async () => {
    const res = await search('minPrice=150');
    const body = res.body as FacetBody;
    // price facet omits its own filter → spans all 4 (100..400)
    expect(body.facets.price).toEqual({ min: '100.00', max: '400.00' });
    // results are narrowed to >=150 → 3 products
    expect(body.total).toBe(3);
  });

  it('rating facet threshold counts (unrated excluded)', async () => {
    const res = await search('');
    const r = Object.fromEntries(
      (res.body as FacetBody).facets.ratings.map((x) => [x.minRating, x.count]),
    );
    expect(r[4]).toBe(2); // 4.5, 4.0
    expect(r[3]).toBe(3); // 4.5, 4.0, 3.5
    expect(r[1]).toBe(3); // GammaFx has NULL rating → excluded
  });
});
