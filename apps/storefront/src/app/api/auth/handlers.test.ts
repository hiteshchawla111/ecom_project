import { describe, expect, it, vi } from 'vitest';
import { ApiAuthError, type TokenPair } from '@/lib/api-auth';
import {
  handleConfirmReset,
  handleLogin,
  handleLogout,
  handleRegister,
  handleRequestReset,
  type RouteDeps,
} from './handlers';

const pair: TokenPair = { accessToken: 'a', refreshToken: 'r' };

function deps(over: Partial<RouteDeps> = {}): RouteDeps {
  return {
    register: vi.fn(async () => pair),
    login: vi.fn(async () => pair),
    logout: vi.fn(async () => ({ ok: true as const })),
    setSession: vi.fn(async () => {}),
    clearSession: vi.fn(async () => {}),
    getRefreshToken: vi.fn(async () => 'r'),
    requestReset: vi.fn(async () => ({ ok: true as const })),
    confirmReset: vi.fn(async () => ({ ok: true as const })),
    ...over,
  };
}

describe('handleRegister', () => {
  it('registers, sets the session, and returns 201', async () => {
    const d = deps();
    const res = await handleRegister(
      { email: 'a@test.com', password: 'password123', name: 'Ann' },
      d,
    );

    expect(d.register).toHaveBeenCalledWith({
      email: 'a@test.com',
      password: 'password123',
      name: 'Ann',
    });
    expect(d.setSession).toHaveBeenCalledWith(pair);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 400 with a message when required fields are missing', async () => {
    const d = deps();
    const res = await handleRegister({ email: '', password: '', name: '' }, d);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message');
    expect(d.register).not.toHaveBeenCalled();
    expect(d.setSession).not.toHaveBeenCalled();
  });

  it('maps an API error to its status and message', async () => {
    const d = deps({
      register: vi.fn(async () => {
        throw new ApiAuthError('Email already registered', 409);
      }),
    });
    const res = await handleRegister(
      { email: 'a@test.com', password: 'password123', name: 'Ann' },
      d,
    );

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: 'Email already registered' });
    expect(d.setSession).not.toHaveBeenCalled();
  });
});

describe('handleLogin', () => {
  it('logs in, sets the session, and returns 200', async () => {
    const d = deps();
    const res = await handleLogin(
      { email: 'a@test.com', password: 'password123' },
      d,
    );

    expect(d.login).toHaveBeenCalledWith({
      email: 'a@test.com',
      password: 'password123',
    });
    expect(d.setSession).toHaveBeenCalledWith(pair);
    expect(res.status).toBe(200);
  });

  it('returns 401 message on invalid credentials', async () => {
    const d = deps({
      login: vi.fn(async () => {
        throw new ApiAuthError('Invalid credentials', 401);
      }),
    });
    const res = await handleLogin({ email: 'a@test.com', password: 'x' }, d);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Invalid credentials' });
  });

  it('returns 400 when email is missing', async () => {
    const d = deps();
    const res = await handleLogin({ email: '', password: 'x' }, d);
    expect(res.status).toBe(400);
    expect(d.login).not.toHaveBeenCalled();
  });
});

describe('handleLogout', () => {
  it('revokes the refresh token, clears the session, returns 200', async () => {
    const d = deps();
    const res = await handleLogout(d);

    expect(d.logout).toHaveBeenCalledWith('r');
    expect(d.clearSession).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('clears the session even if there is no refresh token', async () => {
    const d = deps({ getRefreshToken: vi.fn(async () => undefined) });
    const res = await handleLogout(d);

    expect(d.logout).not.toHaveBeenCalled();
    expect(d.clearSession).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('still clears the session if the API logout call fails', async () => {
    const d = deps({
      logout: vi.fn(async () => {
        throw new ApiAuthError('boom', 500);
      }),
    });
    const res = await handleLogout(d);

    expect(d.clearSession).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});

describe('handleRequestReset', () => {
  it('requests a reset with a trimmed email and returns 200', async () => {
    const d = deps();
    const res = await handleRequestReset({ email: '  a@test.com ' }, d);

    expect(d.requestReset).toHaveBeenCalledWith('a@test.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 200 for a non-existent email (enumeration-safe)', async () => {
    const d = deps({ requestReset: vi.fn(async () => ({ ok: true as const })) });
    const res = await handleRequestReset({ email: 'ghost@test.com' }, d);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 400 when email is missing', async () => {
    const d = deps();
    const res = await handleRequestReset({ email: '' }, d);

    expect(res.status).toBe(400);
    expect(d.requestReset).not.toHaveBeenCalled();
  });

  it('maps an API error to its status and message', async () => {
    const d = deps({
      requestReset: vi.fn(async () => {
        throw new ApiAuthError('email must be an email', 400);
      }),
    });
    const res = await handleRequestReset({ email: 'nope' }, d);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'email must be an email' });
  });
});

describe('handleConfirmReset', () => {
  it('confirms the reset and returns 200', async () => {
    const d = deps();
    const res = await handleConfirmReset(
      { token: 'tok', password: 'password123' },
      d,
    );

    expect(d.confirmReset).toHaveBeenCalledWith('tok', 'password123');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 400 when the token is missing (no API call)', async () => {
    const d = deps();
    const res = await handleConfirmReset({ token: '', password: 'password123' }, d);

    expect(res.status).toBe(400);
    expect(d.confirmReset).not.toHaveBeenCalled();
  });

  it('returns 400 when the password is too short (no API call)', async () => {
    const d = deps();
    const res = await handleConfirmReset({ token: 'tok', password: 'short' }, d);

    expect(res.status).toBe(400);
    expect(d.confirmReset).not.toHaveBeenCalled();
  });

  it('returns 400 with a clear message when the password is missing (no API call)', async () => {
    const d = deps();
    const res = await handleConfirmReset({ token: 'tok' }, d);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Password is required.' });
    expect(d.confirmReset).not.toHaveBeenCalled();
  });

  it('maps an invalid/expired token API error', async () => {
    const d = deps({
      confirmReset: vi.fn(async () => {
        throw new ApiAuthError('Invalid or expired reset token', 400);
      }),
    });
    const res = await handleConfirmReset(
      { token: 'bad', password: 'password123' },
      d,
    );

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Invalid or expired reset token' });
  });
});
