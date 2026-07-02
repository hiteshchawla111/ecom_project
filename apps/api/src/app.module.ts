import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { InventoryModule } from './inventory/inventory.module';
import { CustomersModule } from './customers/customers.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SellersModule } from './sellers/sellers.module';
import { SettingsModule } from './settings/settings.module';
import { SearchModule } from './search/search.module';

/**
 * Parse an env var as a positive integer, falling back to `fallback` when the
 * value is absent, blank/whitespace-only, or not a finite number.
 * `??` alone does not guard against empty-string (`THROTTLE_TTL=`), which
 * coerces to 0 and would silently disable rate-limiting.
 */
const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return v !== undefined && v.trim() !== '' && Number.isFinite(n)
    ? n
    : fallback;
};

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: num(process.env.THROTTLE_TTL, 60) * 1000,
          limit: num(process.env.THROTTLE_LIMIT, 120),
        },
      ],
    }),
    PrismaModule,
    CryptoModule,
    AuditModule,
    AuthModule,
    // SearchModule MUST be imported before ProductsModule: both mount under
    // `/products`, and Express matches routes in registration order. Registering
    // the static `GET /products/search` before ProductsController's `GET /products/:id`
    // stops `:id` from swallowing `search`. (Verified by the search HTTP smoke.)
    SearchModule,
    ProductsModule,
    CategoriesModule,
    CartModule,
    OrdersModule,
    SellersModule,
    SettingsModule,
    InventoryModule,
    CustomersModule,
    AnalyticsModule,
    NotificationsModule,
    ReviewsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // ThrottlerGuard runs before JwtAuthGuard/RolesGuard: those are APP_GUARDs in
    // AuthModule.providers, and NestJS resolves a module's own providers before the
    // providers contributed by its imported child modules. (Import-list order is NOT
    // the mechanism.) Rate-limiting therefore runs first/cheapest.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
