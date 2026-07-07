import { IsBooleanString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Query for the notification feed. Query params arrive as strings. */
export class ListNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  /** When 'true', restrict to unread (readAt: null). Query string → validated as boolean-string. */
  @IsOptional()
  @IsBooleanString()
  unread?: string; // 'true' | 'false'
}
