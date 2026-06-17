import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/**
 * Orders domain module. Owns the order lifecycle and its state-machine guard
 * (`order-status.ts`). This slice adds customer order placement + reads;
 * admin status transitions and inventory land in Phase 5.
 */
@Module({
  imports: [PrismaModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
