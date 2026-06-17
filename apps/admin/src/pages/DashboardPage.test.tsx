import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const listProducts = vi.fn();
vi.mock('../lib/products', () => ({
  listProducts: (...a: unknown[]) => listProducts(...a),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { sub: '1', email: 'admin@example.com', role: 'ADMIN' },
  }),
}));

import { DashboardPage } from './DashboardPage';

beforeEach(() => listProducts.mockReset());

describe('DashboardPage', () => {
  it('greets the signed-in user', () => {
    listProducts.mockResolvedValue({ data: [], page: 1, pageSize: 1, total: 0, totalPages: 0 });
    render(<DashboardPage />);
    expect(screen.getByText(/admin@example.com/)).toBeInTheDocument();
  });

  it('shows the real total product count', async () => {
    listProducts.mockResolvedValue({
      data: [],
      page: 1,
      pageSize: 1,
      total: 137,
      totalPages: 137,
    });
    render(<DashboardPage />);

    expect(await screen.findByText('137')).toBeInTheDocument();
    expect(screen.getByText(/total products/i)).toBeInTheDocument();
  });

  it('renders honest placeholder cards (not fabricated analytics)', async () => {
    listProducts.mockResolvedValue({ data: [], page: 1, pageSize: 1, total: 5, totalPages: 5 });
    render(<DashboardPage />);

    await screen.findByText('5');
    // Placeholders read clearly as "coming soon", never as real numbers.
    expect(screen.getAllByText(/coming soon/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to "—" for the count when the fetch fails', async () => {
    listProducts.mockRejectedValueOnce(new Error('boom'));
    render(<DashboardPage />);

    // The total-products card shows "—" rather than crashing the page.
    await waitFor(() => expect(listProducts).toHaveBeenCalled());
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/total products/i)).toBeInTheDocument();
  });
});
