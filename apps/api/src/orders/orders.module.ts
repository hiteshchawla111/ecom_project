import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersController } from './orders.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { SellerSubOrdersController } from './seller-suborders.controller';
import { OrdersService } from './orders.service';
import { SellerApprovedGuard } from '../sellers/guards/seller-approved.guard';

/**
 * Orders domain module. Owns the order lifecycle and its state-machine guard
 * (`order-status.ts`). Placement reserves stock and cancellation releases it
 * via the inventory ledger (`InventoryModule`).
 */
@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [OrdersController, AdminOrdersController, SellerSubOrdersController],
  providers: [OrdersService, SellerApprovedGuard],
  exports: [OrdersService],
})
export class OrdersModule {}
