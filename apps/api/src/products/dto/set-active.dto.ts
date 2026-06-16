import { IsBoolean } from 'class-validator';

/** Toggle a product between ACTIVE and INACTIVE. */
export class SetActiveDto {
  @IsBoolean()
  active!: boolean;
}
