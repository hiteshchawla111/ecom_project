import { Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { MockNotificationChannel } from './mock-notification-channel';

describe('MockNotificationChannel', () => {
  it('logs a user-targeted send and resolves', async () => {
    const spy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const channel = new MockNotificationChannel();
    await expect(
      channel.send({
        type: NotificationType.ORDER_CONFIRMATION,
        userId: 'u1',
        payload: { orderId: 'o1' },
      }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(
      'would send ORDER_CONFIRMATION to user u1',
    );
    spy.mockRestore();
  });

  it('logs a staff-queue send when userId is null', async () => {
    const spy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const channel = new MockNotificationChannel();
    await channel.send({
      type: NotificationType.NEW_ORDER,
      userId: null,
      payload: {},
    });
    expect(spy).toHaveBeenCalledWith('would send NEW_ORDER to staff-queue');
    spy.mockRestore();
  });
});
