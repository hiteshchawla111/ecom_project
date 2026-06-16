import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { ProtectedRoute } from './ProtectedRoute';
import { tokenStore } from '../lib/tokenStore';
import { apiClient } from '../lib/apiClient';
import type { AuthUser, Role } from '../lib/types';

vi.mock('../lib/apiClient', () => ({ apiClient: { request: vi.fn() } }));
const mockedRequest = vi.mocked(apiClient.request);

function renderAt(initial = '/') {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <div>LOGIN PAGE</div> },
      {
        element: <ProtectedRoute />,
        children: [{ path: '/', element: <div>SHELL CONTENT</div> }],
      },
    ],
    { initialEntries: [initial] },
  );
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

function bootAs(role: Role) {
  tokenStore.set({ accessToken: 'AT', refreshToken: 'RT' });
  const user: AuthUser = { sub: '1', email: `${role}@x.com`, role };
  mockedRequest.mockResolvedValueOnce(user);
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('redirects guests to /login', async () => {
    renderAt('/');
    await waitFor(() => expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument());
  });

  it('renders the outlet for ADMIN', async () => {
    bootAs('ADMIN');
    renderAt('/');
    await waitFor(() => expect(screen.getByText('SHELL CONTENT')).toBeInTheDocument());
  });

  it('renders the outlet for INVENTORY_MANAGER', async () => {
    bootAs('INVENTORY_MANAGER');
    renderAt('/');
    await waitFor(() => expect(screen.getByText('SHELL CONTENT')).toBeInTheDocument());
  });

  it('shows access denied for CUSTOMER', async () => {
    bootAs('CUSTOMER');
    renderAt('/');
    await waitFor(() => expect(screen.getByText(/access denied/i)).toBeInTheDocument());
  });

  it('shows the loading indicator and no protected content while auth is resolving', () => {
    tokenStore.set({ accessToken: 'AT', refreshToken: 'RT' });
    // Never resolves: keeps AuthProvider in the 'loading' state.
    mockedRequest.mockReturnValueOnce(new Promise(() => {}));
    renderAt('/');
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('SHELL CONTENT')).not.toBeInTheDocument();
  });
});
