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
 * Query for the public autocomplete endpoint. Params arrive as strings;
 * `@Type(() => Number)` coerces `limit` under the global transforming pipe.
 * A blank/whitespace `q` (or one that sanitizes to no tokens) is valid here
 * and short-circuits to an empty array in the service (no DB hit).
 */
export class SuggestProductsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
