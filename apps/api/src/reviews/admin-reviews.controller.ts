import { Controller, Get, HttpCode, Param, Patch, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ReviewsService } from './reviews.service';
import { ListAdminReviewsDto } from './dto/list-admin-reviews.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth-tokens';

@Roles(Role.ADMIN)
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Query() query: ListAdminReviewsDto) {
    return this.reviews.adminList(query);
  }

  @Patch(':id/hide')
  @HttpCode(204)
  hide(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.reviews.hide(id, user.sub);
  }

  @Patch(':id/unhide')
  @HttpCode(204)
  unhide(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.reviews.unhide(id, user.sub);
  }
}
