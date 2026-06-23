import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { ListStockDto } from './dto/list-stock.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { SellerApprovedGuard } from '../sellers/guards/seller-approved.guard';
import { CurrentSeller } from '../auth/decorators/current-seller.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ScopeActor } from '../products/seller-scope';
import type { AccessTokenPayload } from '../auth/auth-tokens';

/**
 * Seller-facing inventory. Every route is scoped to the acting seller (stock,
 * detail, and manual movements only touch the seller's own items; cross-tenant
 * access 404s via the service-layer scope). ACTIVE-seller status is enforced
 * DB-side by SellerApprovedGuard, which attaches the sellerId read by
 * @CurrentSeller(). Admin/inventory-manager use the separate InventoryController.
 */
@Roles(Role.SELLER)
@UseGuards(SellerApprovedGuard)
@Controller('seller/inventory')
export class SellerInventoryController {
  constructor(private readonly inventory: InventoryService) {}

  private actor(sellerId: string): ScopeActor {
    return { role: Role.SELLER, sellerId };
  }

  @Get()
  listStock(@CurrentSeller() sellerId: string, @Query() query: ListStockDto) {
    return this.inventory.listStock(query, this.actor(sellerId));
  }

  /**
   * Aggregate inventory health for the acting seller only. Declared before
   * `:productId` so the literal route isn't captured as a product id.
   */
  @Get('reports')
  report(@CurrentSeller() sellerId: string) {
    return this.inventory.report(this.actor(sellerId));
  }

  @Get(':productId')
  getStockItem(
    @CurrentSeller() sellerId: string,
    @Param('productId') productId: string,
  ) {
    return this.inventory.getStockItem(productId, this.actor(sellerId));
  }

  @Post(':productId/movements')
  @HttpCode(HttpStatus.NO_CONTENT)
  async createMovement(
    @CurrentUser() user: AccessTokenPayload,
    @CurrentSeller() sellerId: string,
    @Param('productId') productId: string,
    @Body() dto: CreateMovementDto,
  ): Promise<void> {
    await this.inventory.adjust({ ...user, sellerId }, productId, dto);
  }
}
