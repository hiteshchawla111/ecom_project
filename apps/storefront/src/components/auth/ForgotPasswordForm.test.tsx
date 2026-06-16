import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { ForgotPasswordForm } from './ForgotPasswordForm';

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

describe('ForgotPasswordForm', () => {
  it('renders an accessible email field', () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /send reset link/i }),
    ).toBeInTheDocument();
  });

  it('posts the email and redirects to /login on success', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { ok: true }));
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText(/email/i), 'a@test.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    expect(refreshMock).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/password-reset/request',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).toEqual({ email: 'a@test.com' });
  });

  it('disables the submit button while the request is in flight', async () => {
    let resolve!: (r: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise<Response>((r) => {
        resolve = r;
      }),
    );
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText(/email/i), 'a@test.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(screen.getByRole('button')).toBeDisabled();
    resolve(jsonResponse(200, { ok: true }));
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
  });

  it('shows the API error and does not redirect on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(400, { message: 'Email is required.' }),
    );
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/email is required/i);
    expect(pushMock).not.toHaveBeenCalled();
  });
});
