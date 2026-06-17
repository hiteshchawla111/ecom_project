import { IsInt, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

/** Add a product to the cart (or increment if already present). */
export class AddCartItemDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}
