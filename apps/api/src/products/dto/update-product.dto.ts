import {
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Partial update of a product. All fields optional. SKU is immutable
 * post-creation (stable external identifier) and status changes flow through
 * the dedicated archive/activate endpoints — neither is updatable here.
 */
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsPositive()
  price?: number;

  @IsOptional()
  @IsPositive()
  salePrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  categoryId?: string;
}
