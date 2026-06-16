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
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

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
    return this.products.list(query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @HttpCode(200)
  @Post(':id/archive')
  archive(@Param('id') id: string) {
    return this.products.archive(id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.products.setActive(id, dto.active);
  }
}
