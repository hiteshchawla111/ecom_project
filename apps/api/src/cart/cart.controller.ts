import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth-tokens';

/**
 * Customer-scoped shopping cart. Every route operates on the caller's own
 * active cart (resolved from the access token) — no cart id in any path, so
 * ownership can't be spoofed. Role boundary enforced by the global RolesGuard.
 */
@Roles(Role.CUSTOMER)
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser() user: AccessTokenPayload) {
    return this.cart.getCart(user.sub);
  }

  @Post('items')
  addItem(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cart.addItem(user.sub, dto.productId, dto.quantity);
  }

  @Patch('items/:productId')
  setQuantity(
    @CurrentUser() user: AccessTokenPayload,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cart.setItemQuantity(user.sub, productId, dto.quantity);
  }

  @Delete('items/:productId')
  removeItem(
    @CurrentUser() user: AccessTokenPayload,
    @Param('productId') productId: string,
  ) {
    return this.cart.removeItem(user.sub, productId);
  }

  @Delete()
  clear(@CurrentUser() user: AccessTokenPayload) {
    return this.cart.clear(user.sub);
  }
}
