import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Inventory management. Manual stock movements (additions, deductions,
 * recounts) are restricted to ADMIN and INVENTORY_MANAGER; the role boundary
 * is enforced by the global RolesGuard.
 */
@Roles(Role.ADMIN, Role.INVENTORY_MANAGER)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  /** Post a manual stock movement against a product's inventory item. */
  @Post(':productId/movements')
  @HttpCode(HttpStatus.NO_CONTENT)
  async createMovement(
    @Param('productId') productId: string,
    @Body() dto: CreateMovementDto,
  ): Promise<void> {
    await this.inventory.adjust(productId, dto);
  }
}
