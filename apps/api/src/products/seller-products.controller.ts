import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { SetActiveDto } from './dto/set-active.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { SellerApprovedGuard } from '../sellers/guards/seller-approved.guard';
import { CurrentSeller } from '../auth/decorators/current-seller.decorator';
import { ScopeActor } from './seller-scope';

/**
 * Seller-facing product catalog. Every route is scoped to the acting seller:
 * a seller can only see/mutate their own products (cross-tenant access 404s via
 * the service-layer scope). ACTIVE-seller status is enforced DB-side by
 * SellerApprovedGuard, which also attaches the sellerId read by @CurrentSeller().
 * Admin keeps its separate cross-seller surface on ProductsController (/products).
 */
@Roles(Role.SELLER)
@UseGuards(SellerApprovedGuard)
@Controller('seller/products')
export class SellerProductsController {
  constructor(private readonly products: ProductsService) {}

  private actor(sellerId: string): ScopeActor {
    return { role: Role.SELLER, sellerId };
  }

  @Get()
  list(@CurrentSeller() sellerId: string, @Query() query: ListProductsDto) {
    return this.products.list(query, this.actor(sellerId));
  }

  @Get(':id')
  findOne(@CurrentSeller() sellerId: string, @Param('id') id: string) {
    return this.products.findOne(id, this.actor(sellerId));
  }

  @Post()
  create(@CurrentSeller() sellerId: string, @Body() dto: CreateProductDto) {
    return this.products.create(dto, this.actor(sellerId));
  }

  @Patch(':id')
  update(
    @CurrentSeller() sellerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(id, dto, this.actor(sellerId));
  }

  @HttpCode(200)
  @Post(':id/archive')
  archive(@CurrentSeller() sellerId: string, @Param('id') id: string) {
    return this.products.archive(id, this.actor(sellerId));
  }

  @Patch(':id/active')
  setActive(
    @CurrentSeller() sellerId: string,
    @Param('id') id: string,
    @Body() dto: SetActiveDto,
  ) {
    return this.products.setActive(id, dto.active, this.actor(sellerId));
  }
}
