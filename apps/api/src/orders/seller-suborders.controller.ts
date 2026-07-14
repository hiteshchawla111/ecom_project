import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { ListSubOrdersDto } from './dto/list-suborders.dto';
import { UpdateSubOrderStatusDto } from './dto/update-suborder-status.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { SellerApprovedGuard } from '../sellers/guards/seller-approved.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth-tokens';
import { ScopeActor } from '../products/seller-scope';

/**
 * Seller fulfillment queue + per-SubOrder transitions. A SELLER is scoped to
 * their own sub-orders (cross-tenant access 404s via the service scope). ADMIN
 * passes SellerApprovedGuard's bypass (no sellerId attached) and buildSellerScope
 * returns {} → cross-seller. RolesGuard admits both roles.
 */
@Roles(Role.SELLER, Role.ADMIN)
@UseGuards(SellerApprovedGuard)
@Controller('seller/suborders')
export class SellerSubOrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Build the ownership scope: ADMIN unscoped, SELLER scoped to req.sellerId
   *  (attached by SellerApprovedGuard for an ACTIVE seller). */
  private scopeFor(user: AccessTokenPayload, sellerId?: string): ScopeActor {
    return user.role === Role.ADMIN
      ? { role: Role.ADMIN }
      : { role: Role.SELLER, sellerId: sellerId! };
  }

  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: { sellerId?: string },
    @Query() query: ListSubOrdersDto,
  ) {
    return this.orders.listSellerSubOrders(this.scopeFor(user, req.sellerId), query);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: { sellerId?: string },
    @Param('id') id: string,
    @Body() dto: UpdateSubOrderStatusDto,
  ) {
    return this.orders.transitionSubOrder(
      { sub: user.sub, role: user.role, sellerId: req.sellerId },
      id,
      dto.status,
    );
  }
}
