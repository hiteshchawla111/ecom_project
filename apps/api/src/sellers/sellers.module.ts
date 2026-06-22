import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SellersController } from './sellers.controller';
import { SellersService } from './sellers.service';

/**
 * Seller domain module.
 *
 * Exports SellersService so it can be reused by downstream modules (e.g. M2
 * product listings will need to resolve the seller for a given product).
 *
 * CryptoModule and AuditModule are @Global() — not imported here.
 * EventEmitter2 is registered app-globally via EventEmitterModule.forRoot().
 */
@Module({
  imports: [PrismaModule],
  controllers: [SellersController],
  providers: [SellersService],
  exports: [SellersService],
})
export class SellersModule {}
