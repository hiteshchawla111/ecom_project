import { IsEnum } from 'class-validator';
import { SubOrderStatus } from '@prisma/client';

export class UpdateSubOrderStatusDto {
  @IsEnum(SubOrderStatus)
  status!: SubOrderStatus;
}
