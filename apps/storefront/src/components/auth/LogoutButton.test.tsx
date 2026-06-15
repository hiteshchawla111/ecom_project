import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { LogoutButton } from './LogoutButton';

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('LogoutButton', () => {
  it('POSTs to the logout endpoint and redirects home', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
    expect(refreshMock).toHaveBeenCalled();
  });

  it('still redirects home if the logout request throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
  });
});
