import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus } from '@prisma/client';

/** Sortable product columns exposed by the list endpoint. */
export enum ProductSortBy {
  CreatedAt = 'createdAt',
  Price = 'price',
  Name = 'name',
}

export enum SortDir {
  Asc = 'asc',
  Desc = 'desc',
}

/**
 * Query for the product list endpoint: pagination + search/filter/sort.
 * Query params arrive as strings; `@Type(() => Number)` coerces numerics
 * under the global transforming pipe. All fields are optional.
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

  /** Free-text search across name, SKU and description (case-insensitive). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  categoryId?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  maxPrice?: number;

  @IsOptional()
  @IsEnum(ProductSortBy)
  sortBy?: ProductSortBy;

  @IsOptional()
  @IsEnum(SortDir)
  sortDir?: SortDir;
}
