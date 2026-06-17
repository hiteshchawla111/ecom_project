import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Shipping address captured at checkout; snapshotted onto the order. */
export class CheckoutDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  shipFullName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  shipLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  shipLine2?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  shipCity!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  shipState!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  shipCountry!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  shipPostalCode!: string;
}
