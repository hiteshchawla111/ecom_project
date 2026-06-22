import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth-tokens';
import { SellersService } from './sellers.service';
import { ListSellersDto } from './dto/list-sellers.dto';
import { UpdateSellerStatusDto } from './dto/update-seller-status.dto';

/**
 * Admin seller management endpoints.
 *
 * ADMIN-only (class-level @Roles guard). Thin delegation — all business logic
 * lives in SellersService.
 */
@Roles(Role.ADMIN)
@Controller('admin/sellers')
export class AdminSellersController {
  constructor(private readonly sellers: SellersService) {}

  /**
   * GET /admin/sellers
   *
   * Paginated list of all sellers with optional status filter.
   */
  @Get()
  list(@Query() query: ListSellersDto) {
    return this.sellers.listSellers(query);
  }

  /**
   * GET /admin/sellers/:id
   *
   * Returns a single seller's masked detail view.
   */
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.sellers.getSeller(id);
  }

  /**
   * PATCH /admin/sellers/:id/status
   *
   * Transitions the seller's status. Validated against the state machine in
   * SellersService. The acting admin is passed for audit logging.
   */
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSellerStatusDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.sellers.updateStatus(id, dto, user);
  }
}
