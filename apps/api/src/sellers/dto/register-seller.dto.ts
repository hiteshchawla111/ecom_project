import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// ---------------------------------------------------------------------------
// KYC regex patterns — reused by both RegisterSellerDto and UpdateSellerDto
// ---------------------------------------------------------------------------

/** Indian GSTIN: 15 chars — 2-digit state code + PAN + 1-digit entity + 'Z' + checksum. */
export const GSTIN_PATTERN =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** Indian PAN: 10 chars — 5 alpha + 4 digits + 1 alpha. */
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Bank account number: 9–18 digits. */
export const BANK_ACCOUNT_PATTERN = /^[0-9]{9,18}$/;

/** Indian IFSC: 11 chars — 4 alpha + '0' + 6 alphanumeric. */
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------

/**
 * Request body for POST /seller/register.
 *
 * The global ValidationPipe (whitelist + forbidNonWhitelisted) ensures that
 * any field NOT declared here — including `status`, `slug`, `role`, and
 * `userId` — is stripped/rejected automatically.
 */
export class RegisterSellerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'logoUrl must be an http(s) URL' },
  )
  @MaxLength(500)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @Matches(GSTIN_PATTERN, {
    message: 'gstin must be a valid 15-character GSTIN',
  })
  gstin?: string;

  @IsOptional()
  @IsString()
  @Matches(PAN_PATTERN, {
    message: 'pan must be a valid 10-character PAN',
  })
  pan?: string;

  @IsOptional()
  @IsString()
  @Matches(BANK_ACCOUNT_PATTERN, {
    message: 'bankAccountNo must be 9–18 digits',
  })
  bankAccountNo?: string;

  @IsOptional()
  @IsString()
  @Matches(IFSC_PATTERN, {
    message: 'bankIfsc must be a valid 11-character IFSC',
  })
  bankIfsc?: string;
}
