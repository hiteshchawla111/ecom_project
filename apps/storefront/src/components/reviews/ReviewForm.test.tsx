import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReviewForm } from './ReviewForm';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ReviewForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    push.mockClear();
    refresh.mockClear();
  });

  it('shows a sign-in link (not the form) when the user cannot attempt', () => {
    render(<ReviewForm productId="p1" canAttempt={false} />);
    const link = screen.getByRole('link', { name: /sign in to write a review/i });
    expect(link).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: /post review/i })).toBeNull();
  });

  it('renders the form for a logged-in customer', () => {
    render(<ReviewForm productId="p1" canAttempt={true} />);
    expect(screen.getByRole('radiogroup', { name: /your rating/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /post review/i })).toBeInTheDocument();
  });

  it('blocks submit with an inline error when no rating is selected', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ReviewForm productId="p1" canAttempt={true} />);
    fireEvent.click(screen.getByRole('button', { name: /post review/i }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/select a rating/i),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('selects a rating via keyboard and posts, then shows success + refreshes', async () => {
    const created = { id: 'r1', rating: 4 };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, created));
    vi.stubGlobal('fetch', fetchMock);
    render(<ReviewForm productId="p1" canAttempt={true} />);

    // Click the 4th star.
    fireEvent.click(screen.getByRole('radio', { name: /4 stars/i }));
    fireEvent.click(screen.getByRole('button', { name: /post review/i }));

    await waitFor(() =>
      expect(screen.getByText(/thanks.*your review is posted/i)).toBeInTheDocument(),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/products/p1/reviews');
    expect(JSON.parse(init.body as string)).toMatchObject({ rating: 4 });
    expect(refresh).toHaveBeenCalled();
  });

  it.each([
    [403, /received/i],
    [409, /already reviewed/i],
    [400, /rating must be/i],
  ])('maps a %i response to an inline message', async (status, matcher) => {
    const messages: Record<number, string> = {
      403: 'You can only review a product you have received.',
      409: 'You have already reviewed this product.',
      400: 'Rating must be an integer from 1 to 5.',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(status, { message: messages[status] }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ReviewForm productId="p1" canAttempt={true} />);
    fireEvent.click(screen.getByRole('radio', { name: /5 stars/i }));
    fireEvent.click(screen.getByRole('button', { name: /post review/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(matcher));
    expect(push).not.toHaveBeenCalled();
  });

  it('redirects to /login on a 401 (session expired mid-submit)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { message: 'nope' }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ReviewForm productId="p1" canAttempt={true} />);
    fireEvent.click(screen.getByRole('radio', { name: /5 stars/i }));
    fireEvent.click(screen.getByRole('button', { name: /post review/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
  });
});
