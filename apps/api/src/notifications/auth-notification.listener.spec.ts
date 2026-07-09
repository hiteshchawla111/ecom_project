import { Logger } from '@nestjs/common';
import { AuthNotificationListener } from './auth-notification.listener';

describe('AuthNotificationListener', () => {
  it('records a registration notification on the event', async () => {
    const notifications = {
      recordRegistration: jest.fn().mockResolvedValue(undefined),
    };
    const listener = new AuthNotificationListener(notifications as never);
    await listener.handle({ userId: 'u1' });
    expect(notifications.recordRegistration).toHaveBeenCalledWith({
      userId: 'u1',
    });
  });

  it('swallows and logs a failed write', async () => {
    const notifications = {
      recordRegistration: jest.fn().mockRejectedValue(new Error('db')),
    };
    const listener = new AuthNotificationListener(notifications as never);
    // suppress the expected Logger.error output in test runs
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(listener.handle({ userId: 'u1' })).resolves.toBeUndefined();
  });
});
