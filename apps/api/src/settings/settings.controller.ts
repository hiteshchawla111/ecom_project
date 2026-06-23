import { Body, Controller, Get, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SettingsService } from './settings.service';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth-tokens';

/**
 * Branding settings. The read is public — both storefront and admin resolve
 * their brand color from it at load. The write is ADMIN-only (RolesGuard) and
 * audited in the service.
 */
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get('branding')
  getBranding() {
    return this.settings.getBranding();
  }

  @Roles(Role.ADMIN)
  @Put('branding')
  updateBranding(
    @Body() dto: UpdateBrandingDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.settings.setBranding(dto.hue, user.sub);
  }
}
