import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmProvider } from '../components/ui/confirm';

vi.mock('../lib/reviews', () => ({
  listAdminReviews: vi.fn(),
  hideReview: vi.fn(),
  unhideReview: vi.fn(),
}));

import { listAdminReviews, hideReview, unhideReview } from '../lib/reviews';
import { ReviewsPage } from './ReviewsPage';

const list = listAdminReviews as unknown as ReturnType<typeof vi.fn>;
const hide = hideReview as unknown as ReturnType<typeof vi.fn>;
const unhide = unhideReview as unknown as ReturnType<typeof vi.fn>;

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'r1', rating: 5, title: 'Great', body: 'Loved it',
    isVerified: true, authorName: 'Ann', publishedAt: '2026-07-01T00:00:00.000Z',
    productId: 'p-abc', userId: 'u1', isHidden: false, createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}
function page(data: unknown[], over: Partial<Record<string, number>> = {}) {
  return { data, page: 1, pageSize: 20, total: data.length, totalPages: 1, ...over };
}

function renderPage() {
  return render(
    <ConfirmProvider>
      <ReviewsPage />
    </ConfirmProvider>,
  );
}

describe('ReviewsPage', () => {
  beforeEach(() => {
    list.mockReset(); hide.mockReset(); unhide.mockReset();
    list.mockResolvedValue(page([row()]));
  });

  it('renders review rows from the API', async () => {
    renderPage();
    const title = await screen.findByText('Great');
    const row = title.closest('tr')!;
    expect(within(row).getByText('Ann')).toBeInTheDocument();
    expect(within(row).getByText('Visible')).toBeInTheDocument();
  });

  it('switching visibility to Hidden refetches with isHidden=true and resets to page 1', async () => {
    renderPage();
    await screen.findByText('Great');
    await userEvent.selectOptions(
      screen.getByLabelText(/visibility/i),
      'hidden',
    );
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, isHidden: 'true' }),
      ),
    );
  });

  it('Hide action confirms then calls hideReview and refetches', async () => {
    hide.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText('Great');
    await userEvent.click(screen.getByRole('button', { name: /actions for/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /hide/i }));
    // ConfirmProvider AlertDialog → confirm
    await userEvent.click(await screen.findByRole('button', { name: /^hide$/i }));
    await waitFor(() => expect(hide).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2)); // initial + after action
  });

  it('shows an error banner with Try again on load failure', async () => {
    list.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('shows the empty state when there are no reviews', async () => {
    list.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText(/no reviews/i)).toBeInTheDocument();
  });
});
