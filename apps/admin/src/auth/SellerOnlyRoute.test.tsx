import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Role } from '../lib/types';

const useAuth = vi.fn();
vi.mock('./AuthContext', () => ({ useAuth: () => useAuth() }));

import { SellerOnlyRoute } from './SellerOnlyRoute';

function renderAt(role: Role) {
  useAuth.mockReturnValue({
    status: 'authed',
    user: { sub: 'u1', email: 's@b.c', role },
  });
  const router = createMemoryRouter(
    [
      {
        element: <SellerOnlyRoute />,
        children: [{ index: true, element: <div>SELLER AREA</div> }],
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('SellerOnlyRoute', () => {
  it('renders the child route for a SELLER', () => {
    renderAt('SELLER');
    expect(screen.getByText('SELLER AREA')).toBeInTheDocument();
  });

  it('denies an ADMIN', () => {
    renderAt('ADMIN');
    expect(screen.queryByText('SELLER AREA')).not.toBeInTheDocument();
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
  });
});
