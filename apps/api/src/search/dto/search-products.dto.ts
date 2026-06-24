import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query for the public product search endpoint. Params arrive as strings;
 * `@Type(() => Number)` coerces numerics under the global transforming pipe.
 * A blank/whitespace `q` is valid here and short-circuits to an empty page
 * in the service (no DB hit).
 */
export class SearchProductsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

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
