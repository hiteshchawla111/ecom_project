import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth-tokens';

/**
 * Personal notification feed for any authenticated user. Visibility is
 * owner-scoped in the service (own rows; staff also see the shared userId:null
 * queue) — not a role gate, so there is no class-level @Roles.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload, @Query() query: ListNotificationsDto) {
    return this.notifications.list(user, query);
  }

  // Literal routes declared before ':id' so they aren't captured by the param route.
  @Get('unread-count')
  unreadCount(@CurrentUser() user: AccessTokenPayload) {
    return this.notifications.unreadCount(user);
  }

  @Patch('read-all')
  readAll(@CurrentUser() user: AccessTokenPayload) {
    return this.notifications.markAllRead(user);
  }

  @Patch(':id/read')
  @HttpCode(204)
  async read(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string): Promise<void> {
    const ok = await this.notifications.markRead(user, id);
    if (!ok) throw new NotFoundException('Notification not found.');
  }
}
