import { IsInt, IsOptional, IsString, MaxLength, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { SubOrderStatus } from '@prisma/client';

export class ListSubOrdersDto {
  @IsOptional() @IsString() @MaxLength(200)
  cursor?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;

  @IsOptional() @IsEnum(SubOrderStatus)
  status?: SubOrderStatus;
}
