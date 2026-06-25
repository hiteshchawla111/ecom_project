import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProductStatus, Role } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { SellersService } from './sellers.service';
import { ProductsService } from '../products/products.service';
import { ListProductsDto } from '../products/dto/list-products.dto';
import { ScopeActor } from '../products/seller-scope';

/** Unscoped actor for public catalog reads (ADMIN → no ownership WHERE clause). */
const PUBLIC_READ_ACTOR: ScopeActor = { role: Role.ADMIN };

/**
 * Public, unauthenticated seller storefront reads.
 *
 * Both routes are @Public(). A seller is only reachable when ACTIVE and not
 * soft-deleted (enforced in SellersService); otherwise 404. The products
 * listing forces status=ACTIVE server-side — a public caller cannot request
 * INACTIVE/ARCHIVED products.
 */
@Controller('sellers')
export class PublicSellersController {
  constructor(
    private readonly sellers: SellersService,
    private readonly products: ProductsService,
  ) {}

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.sellers.getPublicBySlug(slug);
  }

  @Public()
  @Get(':slug/products')
  async listProducts(
    @Param('slug') slug: string,
    @Query() query: ListProductsDto,
  ) {
    // 404 first if the seller isn't publicly visible (consistent with profile).
    const sellerId = await this.sellers.getActiveSellerIdBySlug(slug);
    // Force ACTIVE — a public caller cannot list non-active products.
    return this.products.list(
      { ...query, status: ProductStatus.ACTIVE },
      PUBLIC_READ_ACTOR,
      { sellerId },
    );
  }
}
