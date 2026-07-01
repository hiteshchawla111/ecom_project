/** Domain event emitted after a review is published (post-commit).
 *  Consumed by the notifications module. NOT used for the rating aggregate,
 *  which is maintained in-transaction (M4a design decision). */
export const REVIEW_PUBLISHED_EVENT = 'review.published';

export interface ReviewPublishedEvent {
  reviewId: string;
  productId: string;
  rating: number;
}
