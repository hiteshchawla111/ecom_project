import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from './AppShell';

// Separate file so this mock (SELLER) doesn't collide with the ADMIN mock in
// AppShell.test.tsx or the INVENTORY_MANAGER mock in AppShell.inventory.test.tsx.
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn().mockResolvedValue(undefined),
    status: 'authed',
    user: { sub: '9', email: 'seller@example.com', role: 'SELLER' },
    login: vi.fn(),
  }),
}));

function renderShell() {
  const router = createMemoryRouter(
    [{ element: <AppShell />, children: [{ path: '/', element: <div>DASH</div> }] }],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('AppShell (SELLER)', () => {
  it('shows the seller nav (Dashboard, My Products, My Inventory)', () => {
    renderShell();
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my products/i })).toHaveAttribute('href', '/seller/products');
    expect(screen.getByRole('link', { name: /my inventory/i })).toHaveAttribute('href', '/seller/inventory');
  });

  it('hides the admin nav from a SELLER', () => {
    renderShell();
    // admin links must not appear for a seller
    // /^products$/i anchors the match so it does NOT hit "My Products"
    expect(screen.queryByRole('link', { name: /^products$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /categories/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /orders/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /sellers/i })).not.toBeInTheDocument();
  });
});
