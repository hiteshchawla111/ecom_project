import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'seller@example.com', role: 'SELLER' } }),
}));
const listSellerProducts = vi.fn();
vi.mock('../lib/sellerProducts', () => ({
  listSellerProducts: () => listSellerProducts(),
}));

import { SellerDashboardPage } from './SellerDashboardPage';

describe('SellerDashboardPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the seller product count from the API', async () => {
    listSellerProducts.mockResolvedValue({ data: [], page: 1, pageSize: 1, total: 7, totalPages: 7 });
    render(<SellerDashboardPage />);
    await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument());
    expect(screen.getByText(/my products/i)).toBeInTheDocument();
  });

  it('shows an em dash when the count cannot be loaded (no fabricated number)', async () => {
    listSellerProducts.mockRejectedValue(new Error('down'));
    render(<SellerDashboardPage />);
    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThan(0));
  });
});
