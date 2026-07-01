import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { REVIEW_PUBLISHED_EVENT } from '../reviews/reviews.events';
import type { ReviewPublishedEvent } from '../reviews/reviews.events';
import { NotificationsService } from './notifications.service';

/** Persists a NEW_REVIEW notification when a review is published.
 *  Notifications fire on domain events, not inline (CLAUDE.md). */
@Injectable()
export class ReviewListener {
  private readonly logger = new Logger(ReviewListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(REVIEW_PUBLISHED_EVENT)
  async handle(event: ReviewPublishedEvent): Promise<void> {
    try {
      await this.notifications.recordNewReview(event);
    } catch (err) {
      this.logger.error(
        `Failed to record NEW_REVIEW notification for review ${event.reviewId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
