import { describe, it, expect, beforeEach, vi } from 'vitest';

const request = vi.fn();
vi.mock('./apiClient', () => ({
  apiClient: { request: (...a: unknown[]) => request(...a) },
}));

import { listAdminReviews, hideReview, unhideReview } from './reviews';

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({
    data: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
});

describe('listAdminReviews', () => {
  it('builds a query string with only defined params', async () => {
    await listAdminReviews({ page: 2, pageSize: 20, isHidden: 'true' });
    expect(request).toHaveBeenCalledWith(
      '/admin/reviews?page=2&pageSize=20&isHidden=true',
    );
  });

  it('omits undefined params (All visibility)', async () => {
    await listAdminReviews({ page: 1 });
    expect(request).toHaveBeenCalledWith('/admin/reviews?page=1');
  });
});

describe('hideReview', () => {
  it('PATCHes the hide route', async () => {
    request.mockResolvedValue(undefined);
    await hideReview('r1');
    expect(request).toHaveBeenCalledWith('/admin/reviews/r1/hide', {
      method: 'PATCH',
    });
  });
});

describe('unhideReview', () => {
  it('PATCHes the unhide route', async () => {
    request.mockResolvedValue(undefined);
    await unhideReview('r1');
    expect(request).toHaveBeenCalledWith('/admin/reviews/r1/unhide', {
      method: 'PATCH',
    });
  });
});
