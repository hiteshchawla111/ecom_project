import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/**
 * Orders domain module. Owns the order lifecycle and its state-machine guard
 * (`order-status.ts`). Placement reserves stock and cancellation releases it
 * via the inventory ledger (`InventoryModule`).
 */
@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
