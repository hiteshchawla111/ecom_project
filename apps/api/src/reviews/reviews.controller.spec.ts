import { ReviewsController } from './reviews.controller';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';
import type { AccessTokenPayload } from '../auth/auth-tokens';

const userFor = (sub: string) => ({ sub }) as AccessTokenPayload;

const build = () => {
  const reviews = {
    create: jest.fn(),
    listPublic: jest.fn(),
  };
  const ctrl = new ReviewsController(reviews as never);
  return { ctrl, reviews };
};

describe('ReviewsController', () => {
  it('GET delegates to service.listPublic with productId and query', async () => {
    const { ctrl, reviews } = build();
    const query = { limit: 10 } as ListReviewsDto;
    await ctrl.list('p1', query);
    expect(reviews.listPublic).toHaveBeenCalledWith('p1', query);
  });

  it('POST delegates to service.create with productId, user.sub, dto', async () => {
    const { ctrl, reviews } = build();
    const dto = { rating: 5 } as CreateReviewDto;
    await ctrl.create('p1', userFor('u1'), dto);
    expect(reviews.create).toHaveBeenCalledWith('p1', 'u1', dto);
  });
});
