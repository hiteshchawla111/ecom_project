import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------- mocks must be declared before the dynamic import ----------

const listProducts = vi.fn().mockResolvedValue({
  data: [],
  page: 1,
  pageSize: 1,
  total: 0,
  totalPages: 0,
});
vi.mock('../lib/products', () => ({
  listProducts: (...a: unknown[]) => listProducts(...a),
}));

const listSellerProducts = vi.fn().mockResolvedValue({
  data: [],
  page: 1,
  pageSize: 1,
  total: 0,
  totalPages: 0,
});
vi.mock('../lib/sellerProducts', () => ({
  listSellerProducts: (...a: unknown[]) => listSellerProducts(...a),
}));

// useAuth is module-level — override per test via mockReturnValue
const mockUseAuth = vi.fn();
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

import { IndexDashboard } from './IndexDashboard';

describe('IndexDashboard', () => {
  it('renders SellerDashboardPage for a SELLER', () => {
    mockUseAuth.mockReturnValue({
      user: { sub: '2', email: 'seller@example.com', role: 'SELLER' },
    });
    render(<IndexDashboard />);
    expect(screen.getByText(/seller dashboard/i)).toBeInTheDocument();
  });

  it('renders DashboardPage for an ADMIN', () => {
    mockUseAuth.mockReturnValue({
      user: { sub: '1', email: 'admin@example.com', role: 'ADMIN' },
    });
    render(<IndexDashboard />);
    // DashboardPage greets by email
    expect(screen.getByText(/admin@example.com/)).toBeInTheDocument();
  });

  it('renders DashboardPage when user is null', () => {
    mockUseAuth.mockReturnValue({ user: null });
    render(<IndexDashboard />);
    // DashboardPage doesn't crash on null user — it just omits the email
    expect(screen.queryByText(/seller dashboard/i)).not.toBeInTheDocument();
  });
});
