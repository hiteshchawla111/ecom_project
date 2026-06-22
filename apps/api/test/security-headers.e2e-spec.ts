import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Security Headers (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror main.ts: API serves JSON; helmet defaults are sufficient — no custom CSP.
    app.use(helmet());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET / returns 200 with x-content-type-options: nosniff', async () => {
    await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('x-content-type-options', 'nosniff');
  });

  it('GET / includes x-frame-options header', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);
    expect(response.headers['x-frame-options']).toBeDefined();
  });
});
