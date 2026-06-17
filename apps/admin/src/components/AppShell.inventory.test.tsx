import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from './AppShell';

// Separate file so this mock (INVENTORY_MANAGER) doesn't collide with the
// ADMIN mock in AppShell.test.tsx. Locks the role gate: catalog links are
// ADMIN-only and must stay hidden for an inventory manager during refactors.
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn().mockResolvedValue(undefined),
    status: 'authed',
    user: { sub: '2', email: 'stock@example.com', role: 'INVENTORY_MANAGER' },
    login: vi.fn(),
  }),
}));

function renderShell() {
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [{ path: '/', element: <div>DASH</div> }],
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('AppShell (INVENTORY_MANAGER)', () => {
  it('shows Dashboard but hides the ADMIN-only catalog links', () => {
    renderShell();
    expect(
      screen.getByRole('link', { name: /dashboard/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /products/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /categories/i }),
    ).not.toBeInTheDocument();
  });
});
