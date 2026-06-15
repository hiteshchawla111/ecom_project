import { IsString, MinLength } from 'class-validator';

export class ConfirmResetDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
