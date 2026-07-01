import { Logger } from '@nestjs/common';
import { ReviewListener } from './review.listener';

describe('ReviewListener', () => {
  it('records a NEW_REVIEW notification on the event', async () => {
    const notifications = {
      recordNewReview: jest.fn().mockResolvedValue(undefined),
    };
    const listener = new ReviewListener(notifications as never);

    const event = { reviewId: 'r1', productId: 'p1', rating: 5 };
    await listener.handle(event);

    expect(notifications.recordNewReview).toHaveBeenCalledWith(event);
  });

  it('swallows and logs a failed notification write', async () => {
    const notifications = {
      recordNewReview: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const listener = new ReviewListener(notifications as never);
    // suppress the expected Logger.error output in test runs
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(
      listener.handle({ reviewId: 'r1', productId: 'p1', rating: 5 }),
    ).resolves.toBeUndefined();
  });
});
