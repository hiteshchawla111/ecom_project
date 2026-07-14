import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CheckoutDto } from './dto/checkout.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth-tokens';

/**
 * Customer-scoped orders. Placement turns the caller's cart into an order
 * (status PENDING; no payment, no stock reservation yet — Phase 5). Reads are
 * scoped to the caller's own orders; another user's id returns 404. Role
 * boundary enforced by the global RolesGuard.
 */
@Roles(Role.CUSTOMER)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  place(@CurrentUser() user: AccessTokenPayload, @Body() dto: CheckoutDto) {
    return this.orders.placeOrder(user.sub, dto);
  }

  @Get()
  list(@CurrentUser() user: AccessTokenPayload, @Query() query: ListOrdersDto) {
    return this.orders.listOrders(user.sub, query);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.orders.getOrder(user.sub, id);
  }

  /**
   * Customer self-cancel: cancel an order (and every one of its still-PENDING
   * SubOrders) before any seller has started fulfilment. ADMINs no longer
   * transition orders through this route — they act per-SubOrder via the
   * seller endpoint. The service enforces the ownership + all-PENDING rule.
   */
  @Patch(':id/status')
  @Roles(Role.CUSTOMER)
  updateStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatus(user, id, dto.status);
  }
}
