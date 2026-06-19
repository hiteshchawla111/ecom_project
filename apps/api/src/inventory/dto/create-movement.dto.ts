import { IsIn, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { MovementType } from '@prisma/client';

/** The movement types that may be posted manually (order holds are excluded). */
export const MANUAL_MOVEMENT_TYPES = [
  MovementType.ADDITION,
  MovementType.DEDUCTION,
  MovementType.ADJUSTMENT,
] as const;

export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];

/** Body for a manual stock movement (admin / inventory manager). */
export class CreateMovementDto {
  @IsIn(MANUAL_MOVEMENT_TYPES)
  type!: ManualMovementType;

  /**
   * For ADDITION/DEDUCTION: the count to add/remove. For ADJUSTMENT: the new
   * absolute available count (a recount). Always a non-negative integer.
   */
  @IsInt()
  @Min(0)
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
