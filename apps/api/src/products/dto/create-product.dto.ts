import {
  IsEnum,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ProductStatus } from '@prisma/client';

/**
 * Payload to create a product. Prices arrive as numbers and are persisted as
 * Decimal(12,2) by Prisma. `status` is optional — defaults to ACTIVE in the DB.
 */
export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sku!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsPositive()
  price!: number;

  @IsOptional()
  @IsPositive()
  salePrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @IsString()
  @MinLength(1)
  categoryId!: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
