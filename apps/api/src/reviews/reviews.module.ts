import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { AuditModule } from '../audit/audit.module';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { AdminReviewsController } from './admin-reviews.controller';

/**
 * Reviews domain: public product-scoped reads, authenticated customer create
 * (delivered-purchase gate enforced in the service), and ADMIN moderation.
 * Depends on OrdersService (delivered gate), ProductsService (rating recompute),
 * and AuditService (moderation audit trail). EventEmitterModule is global.
 */
@Module({
  imports: [PrismaModule, OrdersModule, ProductsModule, AuditModule],
  controllers: [ReviewsController, AdminReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
