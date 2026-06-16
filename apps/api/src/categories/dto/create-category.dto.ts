import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Slug: lowercase alphanumerics and hyphens (URL-safe). */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(140)
  @Matches(SLUG_PATTERN, {
    message: 'slug must be lowercase alphanumerics separated by hyphens',
  })
  slug!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  parentId?: string;
}
