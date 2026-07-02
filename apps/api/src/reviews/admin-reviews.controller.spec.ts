import { AdminReviewsController } from './admin-reviews.controller';
import { ListAdminReviewsDto } from './dto/list-admin-reviews.dto';
import type { AccessTokenPayload } from '../auth/auth-tokens';

const userFor = (sub: string) => ({ sub }) as AccessTokenPayload;

const build = () => {
  const reviews = {
    adminList: jest.fn(),
    hide: jest.fn(),
    unhide: jest.fn(),
  };
  const ctrl = new AdminReviewsController(reviews as never);
  return { ctrl, reviews };
};

describe('AdminReviewsController', () => {
  it('GET delegates to service.adminList with the query', async () => {
    const { ctrl, reviews } = build();
    const query = { page: 2 } as ListAdminReviewsDto;
    await ctrl.list(query);
    expect(reviews.adminList).toHaveBeenCalledWith(query);
  });

  it('hide delegates to service.hide with id and user.sub', async () => {
    const { ctrl, reviews } = build();
    await ctrl.hide('r1', userFor('admin1'));
    expect(reviews.hide).toHaveBeenCalledWith('r1', 'admin1');
  });

  it('unhide delegates to service.unhide with id and user.sub', async () => {
    const { ctrl, reviews } = build();
    await ctrl.unhide('r1', userFor('admin1'));
    expect(reviews.unhide).toHaveBeenCalledWith('r1', 'admin1');
  });
});
