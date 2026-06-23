import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { SetActiveDto } from './dto/set-active.dto';
import { ScopeActor } from './seller-scope';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth-tokens';

/** Unscoped actor for public (unauthenticated) catalog reads. ADMIN role → buildSellerScope returns {} → no WHERE clause added. */
const PUBLIC_READ_ACTOR: ScopeActor = { role: Role.ADMIN };

/**
 * Reads are public (the storefront catalog needs them). Mutations are
 * ADMIN-only — the role boundary is enforced here by the global RolesGuard,
 * never trusted from a client. Audit logging of these mutations is a Phase 7
 * cross-cutting follow-up.
 */
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Public()
  @Get()
  list(@Query() query: ListProductsDto) {
    return this.products.list(query, PUBLIC_READ_ACTOR);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.products.findOne(id, PUBLIC_READ_ACTOR);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateProductDto,
  ) {
    return this.products.create(dto, user);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(id, dto, user);
  }

  @Roles(Role.ADMIN)
  @HttpCode(200)
  @Post(':id/archive')
  archive(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.products.archive(id, user);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/active')
  setActive(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: SetActiveDto,
  ) {
    return this.products.setActive(id, dto.active, user);
  }
}
