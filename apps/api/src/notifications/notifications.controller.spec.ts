import { NotFoundException } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { Role } from '@prisma/client';

const USER = { sub: 'u1', email: 'c@x', role: Role.CUSTOMER } as const;

function build() {
  const service = {
    list: jest.fn(),
    unreadCount: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  } as unknown as jest.Mocked<NotificationsService>;
  const controller = new NotificationsController(service);
  return { controller, service };
}

describe('NotificationsController', () => {
  it('GET / delegates to list with the user and dto', async () => {
    const { controller, service } = build();
    const dto = { page: 1 };
    await controller.list(USER, dto);
    expect(service.list).toHaveBeenCalledWith(USER, dto);
  });

  it('GET /unread-count delegates to unreadCount', async () => {
    const { controller, service } = build();
    await controller.unreadCount(USER);
    expect(service.unreadCount).toHaveBeenCalledWith(USER);
  });

  it('PATCH /read-all delegates to markAllRead', async () => {
    const { controller, service } = build();
    await controller.readAll(USER);
    expect(service.markAllRead).toHaveBeenCalledWith(USER);
  });

  it('PATCH /:id/read returns void (204) when the row was marked', async () => {
    const { controller, service } = build();
    service.markRead.mockResolvedValue(true);
    await expect(controller.read(USER, 'n1')).resolves.toBeUndefined();
    expect(service.markRead).toHaveBeenCalledWith(USER, 'n1');
  });

  it('PATCH /:id/read throws NotFoundException when the row was not visible', async () => {
    const { controller, service } = build();
    service.markRead.mockResolvedValue(false);
    await expect(controller.read(USER, 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
