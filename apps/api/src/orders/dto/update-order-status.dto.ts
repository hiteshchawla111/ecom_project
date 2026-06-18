import { IsEnum } from 'class-validator';
import { OrderStatus } from '@prisma/client';

/** Target status for an order transition. Validated against the state machine. */
export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
