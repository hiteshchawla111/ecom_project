import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Role } from '../lib/types';

const useAuth = vi.fn();
vi.mock('./AuthContext', () => ({ useAuth: () => useAuth() }));

import { AdminOnlyRoute } from './AdminOnlyRoute';

function renderAt(role: Role) {
  useAuth.mockReturnValue({
    status: 'authed',
    user: { sub: 'u1', email: 'a@b.c', role },
  });
  const router = createMemoryRouter(
    [
      {
        element: <AdminOnlyRoute />,
        children: [{ index: true, element: <div>ADMIN AREA</div> }],
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('AdminOnlyRoute', () => {
  it('renders the child route for an ADMIN', () => {
    renderAt('ADMIN');
    expect(screen.getByText('ADMIN AREA')).toBeInTheDocument();
  });

  it('denies an INVENTORY_MANAGER', () => {
    renderAt('INVENTORY_MANAGER');
    expect(screen.queryByText('ADMIN AREA')).not.toBeInTheDocument();
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
  });
});
