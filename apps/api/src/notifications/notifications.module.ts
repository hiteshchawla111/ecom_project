import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { LowStockListener } from './low-stock.listener';
import { SellerNotificationListener } from './seller.listener';
import { ReviewListener } from './review.listener';

/** Notifications domain: domain-event driven (customer + admin events). (Phase 5/6) */
@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    LowStockListener,
    SellerNotificationListener,
    ReviewListener,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
