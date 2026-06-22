import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsController } from './products.controller';
import { SellerProductsController } from './seller-products.controller';
import { ProductsService } from './products.service';
import { SellerApprovedGuard } from '../sellers/guards/seller-approved.guard';

/** Products domain: public catalog reads, admin CRUD, and seller-scoped CRUD. */
@Module({
  imports: [PrismaModule],
  controllers: [ProductsController, SellerProductsController],
  providers: [ProductsService, SellerApprovedGuard],
  exports: [ProductsService],
})
export class ProductsModule {}
