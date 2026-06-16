import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { ResetPasswordForm } from './ResetPasswordForm';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('ResetPasswordForm', () => {
  it('shows an invalid-link message and no form when token is empty', () => {
    render(<ResetPasswordForm token="" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid or expired/i);
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('rejects mismatched passwords without calling the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    render(<ResetPasswordForm token="tok" />);

    await user.type(screen.getByLabelText(/new password/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'different123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a too-short password without calling the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    render(<ResetPasswordForm token="tok" />);

    await user.type(screen.getByLabelText(/new password/i), 'short');
    await user.type(screen.getByLabelText(/confirm password/i), 'short');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts token + password and redirects to /login on success', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { ok: true }));
    const user = userEvent.setup();
    render(<ResetPasswordForm token="tok" />);

    await user.type(screen.getByLabelText(/new password/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).toEqual({ token: 'tok', password: 'password123' });
  });

  it('shows the API error on an invalid token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(400, { message: 'Invalid or expired reset token' }),
    );
    const user = userEvent.setup();
    render(<ResetPasswordForm token="bad" />);

    await user.type(screen.getByLabelText(/new password/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or expired/i);
    expect(pushMock).not.toHaveBeenCalled();
  });
});
