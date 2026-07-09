import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { LowStockListener } from './low-stock.listener';
import { SellerNotificationListener } from './seller.listener';
import { ReviewListener } from './review.listener';
import { AuthNotificationListener } from './auth-notification.listener';
import { OrderNotificationListener } from './order-notification.listener';

/** Notifications domain: domain-event driven (customer + admin events). (Phase 5/6) */
@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    LowStockListener,
    SellerNotificationListener,
    ReviewListener,
    AuthNotificationListener,
    OrderNotificationListener,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
