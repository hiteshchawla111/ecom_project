import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * Rate-limiting e2e spec.
 *
 * Boots the real AppModule (which registers ThrottlerModule + ThrottlerGuard
 * as APP_GUARD before JwtAuthGuard/RolesGuard). The auth login route is
 * decorated with @Throttle({ default: { ttl: 60_000, limit: 10 } }),
 * so the 11th request within the window must return 429.
 *
 * All 11 supertest calls share one in-process loopback address, so the
 * throttler counts them against the same key and enforces the limit.
 */
describe('Rate Limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('blocks the 11th POST /auth/login attempt with 429', async () => {
    let last = 0;

    for (let i = 0; i < 11; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong' });
      last = res.status;
    }

    // First 10 should return 401 (bad credentials); 11th must be throttled.
    expect(last).toBe(429);
  });

  it('does not throttle POST /auth/refresh within 10 requests', async () => {
    // /auth/refresh inherits the global limit (120/min), so 10 calls should
    // not trigger the tight per-route limit.
    let last = 0;

    for (let i = 0; i < 10; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-token' });
      last = res.status;
    }

    expect(last).not.toBe(429);
  });
});
