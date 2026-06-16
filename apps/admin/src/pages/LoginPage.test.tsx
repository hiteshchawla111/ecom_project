import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { ApiError } from '../lib/types';

const login = vi.fn();
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ login, status: 'guest', user: null, logout: vi.fn() }),
}));

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/', element: <div>HOME</div> },
    ],
    { initialEntries: ['/login'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('submits credentials and navigates home on success', async () => {
    login.mockResolvedValueOnce(undefined);
    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(login).toHaveBeenCalledWith('admin@example.com', 'Password123!');
    await waitFor(() => expect(screen.getByText('HOME')).toBeInTheDocument());
  });

  it('shows a generic error on 401 and surfaces it via role=alert', async () => {
    login.mockRejectedValueOnce(new ApiError(401, 'unauthorized'));
    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/invalid email or password/i);
  });

  it('shows a fallback error on non-401 failures', async () => {
    login.mockRejectedValueOnce(new ApiError(500, 'boom'));
    renderPage();
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/something went wrong/i);
  });
});
