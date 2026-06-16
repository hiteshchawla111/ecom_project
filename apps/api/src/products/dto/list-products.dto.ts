import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Pagination for the product list endpoint. Query params arrive as strings;
 * `@Type(() => Number)` coerces them under the global transforming pipe.
 * Search/filter/sort are a separate Phase 3 slice — not handled here.
 */
export class ListProductsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
