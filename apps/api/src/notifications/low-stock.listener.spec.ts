import { Logger } from '@nestjs/common';
import { LowStockListener } from './low-stock.listener';

describe('LowStockListener', () => {
  it('forwards a low-stock event to NotificationsService.recordLowStock', async () => {
    const service = { recordLowStock: jest.fn().mockResolvedValue(undefined) };
    const listener = new LowStockListener(service as never);

    const event = { productId: 'p1', available: 3, threshold: 5 };
    await listener.handle(event);

    expect(service.recordLowStock).toHaveBeenCalledWith(event);
  });

  it('swallows a persistence failure (does not throw) so the emitter stays healthy', async () => {
    const service = {
      recordLowStock: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const listener = new LowStockListener(service as never);
    // suppress the expected Logger.error output in test runs
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(
      listener.handle({ productId: 'p1', available: 3, threshold: 5 }),
    ).resolves.toBeUndefined();
  });
});
