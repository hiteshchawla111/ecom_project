import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Set the absolute quantity of a cart line. Quantity 0 removes the line. */
export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;
}
