import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { LoginForm } from './LoginForm';

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

describe('LoginForm', () => {
  it('renders accessible email and password fields', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('posts credentials and redirects home on success', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { ok: true }));
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), 'a@test.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).toEqual({ email: 'a@test.com', password: 'password123' });
    expect(refreshMock).toHaveBeenCalled();
  });

  it('shows the API error message and does not redirect on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(401, { message: 'Invalid credentials' }),
    );
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), 'a@test.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /invalid credentials/i,
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('disables the submit button while the request is in flight', async () => {
    let resolve!: (r: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise<Response>((r) => {
        resolve = r;
      }),
    );
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), 'a@test.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByRole('button')).toBeDisabled();
    resolve(jsonResponse(200, { ok: true }));
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
  });
});
