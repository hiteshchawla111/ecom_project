import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { tokenStore } from '../lib/tokenStore';
import { apiClient } from '../lib/apiClient';
import type { AuthUser } from '../lib/types';

vi.mock('../lib/apiClient', () => ({
  apiClient: { request: vi.fn() },
}));

const mockedRequest = vi.mocked(apiClient.request);

function Probe() {
  const { status, user } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{user?.email ?? ''}</span>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('boots to guest with no token and makes no /me call', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('guest'));
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('boots to authed when a stored token resolves via /auth/me', async () => {
    tokenStore.set({ accessToken: 'AT', refreshToken: 'RT' });
    const user: AuthUser = { sub: '1', email: 'admin@example.com', role: 'ADMIN' };
    mockedRequest.mockResolvedValueOnce(user);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authed'));
    expect(screen.getByTestId('email').textContent).toBe('admin@example.com');
    expect(mockedRequest).toHaveBeenCalledWith('/auth/me');
  });

  it('boots to guest when /auth/me rejects', async () => {
    tokenStore.set({ accessToken: 'AT', refreshToken: 'RT' });
    mockedRequest.mockRejectedValueOnce(new Error('expired'));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('guest'));
  });
});
