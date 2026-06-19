import { Controller, Get, Param, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { ListAdminOrdersDto } from './dto/list-admin-orders.dto';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Admin order management (read). ADMIN-only and NOT customer-scoped: lists and
 * fetches every customer's orders. Status changes / refunds go through the
 * customer-scoped `PATCH /orders/:id/status` (which already permits ADMIN).
 */
@Roles(Role.ADMIN)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: ListAdminOrdersDto) {
    return this.orders.listAllOrders(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.orders.getAnyOrder(id);
  }
}
