import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Public review list: keyset pagination by publishedAt DESC, id DESC. */
export class ListReviewsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string; // opaque "<publishedAtISO>_<id>"

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
