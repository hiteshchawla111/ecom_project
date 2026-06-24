import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import type { ProductSearch } from './product-search';
import { PRODUCT_SEARCH } from './product-search';
import { SearchProductsDto } from './dto/search-products.dto';
import { SuggestProductsDto } from './dto/suggest-products.dto';

/**
 * Public product search. `GET /products/search` — the static `search` segment
 * is more specific than `ProductsController`'s `@Get(':id')`, so Nest matches
 * it first (verified in the HTTP smoke).
 */
@Controller('products')
export class SearchController {
  constructor(
    @Inject(PRODUCT_SEARCH) private readonly productSearch: ProductSearch,
  ) {}

  @Public()
  @Get('search')
  search(@Query() query: SearchProductsDto) {
    return this.productSearch.search(
      query.q ?? '',
      query.page ?? 1,
      query.pageSize ?? 20,
    );
  }

  @Public()
  @Get('suggest')
  suggest(@Query() query: SuggestProductsDto) {
    return this.productSearch.suggest(query.q ?? '', query.limit ?? 8);
  }
}
