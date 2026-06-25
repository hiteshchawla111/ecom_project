import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { ListStockDto } from './dto/list-stock.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth-tokens';

/**
 * Inventory management. Manual stock movements (additions, deductions,
 * recounts) are restricted to ADMIN and INVENTORY_MANAGER; the role boundary
 * is enforced by the global RolesGuard.
 */
@Roles(Role.ADMIN, Role.INVENTORY_MANAGER)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  /** Paginated stock list (available vs reserved + low-stock flag/filter). */
  @Get()
  listStock(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListStockDto,
  ) {
    return this.inventory.listStock(query, user);
  }

  /**
   * Aggregate inventory health across all sellers: product/unit totals,
   * low/out-of-stock counts, and valuation. Declared before `:productId` so the
   * literal route isn't captured as a product id.
   */
  @Get('reports')
  report(@CurrentUser() user: AccessTokenPayload) {
    return this.inventory.report(user);
  }

  /** A product's stock detail plus its recent movement history. */
  @Get(':productId')
  getStockItem(
    @CurrentUser() user: AccessTokenPayload,
    @Param('productId') productId: string,
  ) {
    return this.inventory.getStockItem(productId, user);
  }

  /** Post a manual stock movement against a product's inventory item. */
  @Post(':productId/movements')
  @HttpCode(HttpStatus.NO_CONTENT)
  async createMovement(
    @CurrentUser() user: AccessTokenPayload,
    @Param('productId') productId: string,
    @Body() dto: CreateMovementDto,
  ): Promise<void> {
    await this.inventory.adjust(user, productId, dto);
  }
}
