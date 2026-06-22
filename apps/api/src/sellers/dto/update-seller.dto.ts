import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  BANK_ACCOUNT_PATTERN,
  GSTIN_PATTERN,
  IFSC_PATTERN,
  PAN_PATTERN,
} from './register-seller.dto';

/**
 * Request body for PATCH /seller/me.
 *
 * All fields are optional — only supplied fields are written to the database.
 *
 * `description` and `logoUrl` are nullable so callers can explicitly clear
 * them (pass `null`). `ValidateIf` short-circuits the string validators when
 * the value is exactly `null`, letting an explicit null through while still
 * rejecting malformed strings.
 *
 * KYC fields (`gstin`, `pan`, `bankAccountNo`, `bankIfsc`) accept only
 * well-formed values (format validated by @Matches). An empty string is
 * intentionally rejected — the service treats absent vs. blank consistently,
 * and the DTO enforcing non-empty format strings means callers must omit a
 * field rather than blank it.
 *
 * The global ValidationPipe (whitelist + forbidNonWhitelisted) ensures that
 * any field NOT declared here — including `status`, `slug`, `role`, and
 * `userId` — is stripped/rejected automatically.
 */
export class UpdateSellerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;

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
