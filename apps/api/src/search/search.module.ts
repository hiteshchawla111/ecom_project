import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SearchController } from './search.controller';
import { PRODUCT_SEARCH } from './product-search';
import { PostgresProductSearch } from './postgres-product-search';

/**
 * Search domain: the swappable ProductSearch seam (ADR-009) with the Postgres
 * GIN FTS default binding (ADR-011/010). Bind an ES adapter here later by env.
 */
@Module({
  imports: [PrismaModule],
  controllers: [SearchController],
  providers: [{ provide: PRODUCT_SEARCH, useClass: PostgresProductSearch }],
})
export class SearchModule {}
