import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsService } from './notifications.service';
import { LowStockListener } from './low-stock.listener';
import { SellerNotificationListener } from './seller.listener';

/** Notifications domain: domain-event driven (customer + admin events). (Phase 5/6) */
@Module({
  imports: [PrismaModule],
  providers: [
    NotificationsService,
    LowStockListener,
    SellerNotificationListener,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
