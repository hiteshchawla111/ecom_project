import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from './AppShell';

const logout = vi.fn().mockResolvedValue(undefined);
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    logout,
    status: 'authed',
    user: { sub: '1', email: 'admin@example.com', role: 'ADMIN' },
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
      { path: '/login', element: <div>LOGIN PAGE</div> },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('AppShell', () => {
  afterEach(() => vi.clearAllMocks());

  it('shows the current user email', () => {
    renderShell();
    expect(screen.getByTestId('current-user')).toHaveTextContent('admin@example.com');
  });

  it('logs out and redirects to /login', async () => {
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(logout).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument());
  });

  it('renders nav links to Dashboard, Products and Categories for an ADMIN', () => {
    renderShell();
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('link', { name: /products/i })).toHaveAttribute(
      'href',
      '/products',
    );
    expect(screen.getByRole('link', { name: /categories/i })).toHaveAttribute(
      'href',
      '/categories',
    );
  });

  it('marks the Dashboard link active on the index route', () => {
    renderShell();
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
