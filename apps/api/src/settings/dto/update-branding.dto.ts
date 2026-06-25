import { IsInt, Max, Min } from 'class-validator';

/** Branding update: a single hue on the color wheel (0–360 degrees). */
export class UpdateBrandingDto {
  @IsInt()
  @Min(0)
  @Max(360)
  hue!: number;
}
