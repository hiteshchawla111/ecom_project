import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { RegisterForm } from './RegisterForm';

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

describe('RegisterForm', () => {
  it('renders name, email, and password fields', () => {
    render(<RegisterForm />);
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create account/i }),
    ).toBeInTheDocument();
  });

  it('blocks submit and shows a hint when the password is too short', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText(/name/i), 'Ann');
    await user.type(screen.getByLabelText(/email/i), 'a@test.com');
    await user.type(screen.getByLabelText(/password/i), 'short');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/8 characters/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('posts the registration and redirects home on success', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(201, { ok: true }));
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText(/name/i), 'Ann');
    await user.type(screen.getByLabelText(/email/i), 'a@test.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).toEqual({
      name: 'Ann',
      email: 'a@test.com',
      password: 'password123',
    });
  });

  it('surfaces a conflict error from the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(409, { message: 'Email already registered' }),
    );
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText(/name/i), 'Ann');
    await user.type(screen.getByLabelText(/email/i), 'a@test.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /already registered/i,
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});
