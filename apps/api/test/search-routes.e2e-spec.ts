/**
 * e2e: search/suggest route precedence.
 *
 * Both `GET /products/search` and `GET /products/suggest` are static routes
 * under `/products`, mounted by SearchModule. ProductsController also mounts
 * `GET /products/:id`. Express matches in registration order, so SearchModule
 * MUST be imported before ProductsModule in app.module.ts. This guard fails
 * (404) if that ordering regresses — a level unit tests cannot catch.
 *
 * No seeding required: the assertion is route resolution (status !== 404),
 * not result contents.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('search routes (precedence)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /products/search resolves (not shadowed by /products/:id)', async () => {
    const res = await request(app.getHttpServer()).get(
      '/products/search?q=aurora',
    );
    expect(res.status).toBe(200);
  });

  it('GET /products/suggest resolves (not shadowed by /products/:id)', async () => {
    const res = await request(app.getHttpServer()).get(
      '/products/suggest?q=aurora',
    );
    expect(res.status).toBe(200);
  });
});
