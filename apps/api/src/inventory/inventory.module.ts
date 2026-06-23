import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryController } from './inventory.controller';
import { SellerInventoryController } from './seller-inventory.controller';
import { InventoryService } from './inventory.service';
import { SellerApprovedGuard } from '../sellers/guards/seller-approved.guard';

/** Inventory domain: available/reserved, movement ledger, low-stock alerts. (Phase 5) */
@Module({
  imports: [PrismaModule],
  controllers: [InventoryController, SellerInventoryController],
  providers: [InventoryService, SellerApprovedGuard],
  exports: [InventoryService],
})
export class InventoryModule {}
