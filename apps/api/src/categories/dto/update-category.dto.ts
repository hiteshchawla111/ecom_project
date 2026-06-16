import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Partial update. `parentId` is tri-state: omitted (unchanged), a string
 * (reparent), or null (detach to a root category). `ValidateIf` lets null
 * through while still string-validating a provided id.
 */
export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(140)
  @Matches(SLUG_PATTERN, {
    message: 'slug must be lowercase alphanumerics separated by hyphens',
  })
  slug?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  parentId?: string | null;
}
