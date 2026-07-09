import { Logger } from '@nestjs/common';
import { OrderNotificationListener } from './order-notification.listener';
import { OrderStatus } from '@prisma/client';

describe('OrderNotificationListener', () => {
  it('records order-placed notifications on ORDER_PLACED', async () => {
    const notifications = {
      recordOrderPlaced: jest.fn().mockResolvedValue(undefined),
      recordOrderStatus: jest.fn(),
    };
    const listener = new OrderNotificationListener(notifications as never);
    await listener.onPlaced({ orderId: 'o1', userId: 'u1' });
    expect(notifications.recordOrderPlaced).toHaveBeenCalledWith({
      orderId: 'o1',
      userId: 'u1',
    });
  });

  it('records status notification on ORDER_STATUS_CHANGED', async () => {
    const notifications = {
      recordOrderPlaced: jest.fn(),
      recordOrderStatus: jest.fn().mockResolvedValue(undefined),
    };
    const listener = new OrderNotificationListener(notifications as never);
    await listener.onStatus({
      orderId: 'o1',
      userId: 'u1',
      status: OrderStatus.SHIPPED,
    });
    expect(notifications.recordOrderStatus).toHaveBeenCalledWith({
      orderId: 'o1',
      userId: 'u1',
      status: OrderStatus.SHIPPED,
    });
  });

  it('swallows and logs a failed write', async () => {
    const notifications = {
      recordOrderPlaced: jest.fn().mockRejectedValue(new Error('db')),
      recordOrderStatus: jest.fn(),
    };
    const listener = new OrderNotificationListener(notifications as never);
    // suppress the expected Logger.error output in test runs
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(
      listener.onPlaced({ orderId: 'o1', userId: 'u1' }),
    ).resolves.toBeUndefined();
  });
});
