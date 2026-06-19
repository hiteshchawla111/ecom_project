import { NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';

const makePrisma = () => ({
  notification: { create: jest.fn() },
});

describe('NotificationsService.recordLowStock', () => {
  it('creates an admin-facing LOW_STOCK notification with the event payload', async () => {
    const prisma = makePrisma();
    const svc = new NotificationsService(prisma as never);

    await svc.recordLowStock({
      productId: 'p1',
      available: 3,
      threshold: 5,
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        type: NotificationType.LOW_STOCK,
        userId: null,
        payload: { productId: 'p1', available: 3, threshold: 5 },
      },
    });
  });
});
