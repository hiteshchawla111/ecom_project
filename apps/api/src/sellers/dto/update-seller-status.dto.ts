import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SellerStatus } from '@prisma/client';

/** Target status for a seller transition plus an optional reason. */
export class UpdateSellerStatusDto {
  @IsEnum(SellerStatus)
  status!: SellerStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
