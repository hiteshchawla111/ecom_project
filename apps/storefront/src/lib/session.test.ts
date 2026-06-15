import { describe, expect, it, vi } from 'vitest';
import { ApiAuthError, type CurrentUser, type TokenPair } from './api-auth';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  cookieOptions,
  resolveSession,
  type SessionDeps,
} from './session';

const user: CurrentUser = { sub: 'u1', email: 'a@test.com', role: 'CUSTOMER' };

/** Minimal in-memory cookie store matching the slice we use of Next's store. */
function memStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const sets: { name: string; value: string }[] = [];
  const deletes: string[] = [];
  return {
    store: {
      get: (name: string) =>
        map.has(name) ? { name, value: map.get(name)! } : undefined,
      set: (name: string, value: string) => {
        map.set(name, value);
        sets.push({ name, value });
      },
      delete: (name: string) => {
        map.delete(name);
        deletes.push(name);
      },
    },
    sets,
    deletes,
  };
}

describe('resolveSession', () => {
  it('returns null when there is no access or refresh cookie', async () => {
    const { store } = memStore();
    const deps: SessionDeps = {
      fetchCurrentUser: vi.fn(),
      refresh: vi.fn(),
    };

    expect(await resolveSession(store, deps)).toBeNull();
    expect(deps.fetchCurrentUser).not.toHaveBeenCalled();
  });

  it('returns the user when the access token is valid', async () => {
    const { store } = memStore({ [ACCESS_COOKIE]: 'good', [REFRESH_COOKIE]: 'r' });
    const deps: SessionDeps = {
      fetchCurrentUser: vi.fn(async () => user),
      refresh: vi.fn(),
    };

    expect(await resolveSession(store, deps)).toEqual(user);
    expect(deps.fetchCurrentUser).toHaveBeenCalledWith('good');
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it('refreshes when the access token is expired, then retries /me', async () => {
    const { store, sets } = memStore({
      [ACCESS_COOKIE]: 'expired',
      [REFRESH_COOKIE]: 'r1',
    });
    const newPair: TokenPair = { accessToken: 'a2', refreshToken: 'r2' };
    const fetchCurrentUser = vi
      .fn<(t: string) => Promise<CurrentUser>>()
      .mockRejectedValueOnce(new ApiAuthError('expired', 401))
      .mockResolvedValueOnce(user);
    const deps: SessionDeps = {
      fetchCurrentUser,
      refresh: vi.fn(async () => newPair),
    };

    const result = await resolveSession(store, deps);

    expect(result).toEqual(user);
    expect(deps.refresh).toHaveBeenCalledWith('r1');
    // second /me call uses the freshly minted access token
    expect(fetchCurrentUser).toHaveBeenLastCalledWith('a2');
    // rotated tokens are written back to cookies
    expect(sets).toEqual([
      { name: ACCESS_COOKIE, value: 'a2' },
      { name: REFRESH_COOKIE, value: 'r2' },
    ]);
  });

  it('tries to refresh using the refresh cookie even with no access cookie', async () => {
    const { store } = memStore({ [REFRESH_COOKIE]: 'r1' });
    const newPair: TokenPair = { accessToken: 'a2', refreshToken: 'r2' };
    const deps: SessionDeps = {
      fetchCurrentUser: vi.fn(async () => user),
      refresh: vi.fn(async () => newPair),
    };

    const result = await resolveSession(store, deps);

    expect(result).toEqual(user);
    expect(deps.refresh).toHaveBeenCalledWith('r1');
    expect(deps.fetchCurrentUser).toHaveBeenCalledWith('a2');
  });

  it('clears cookies and returns null when refresh also fails', async () => {
    const { store, deletes } = memStore({
      [ACCESS_COOKIE]: 'expired',
      [REFRESH_COOKIE]: 'bad',
    });
    const deps: SessionDeps = {
      fetchCurrentUser: vi.fn(async () => {
        throw new ApiAuthError('expired', 401);
      }),
      refresh: vi.fn(async () => {
        throw new ApiAuthError('invalid refresh', 401);
      }),
    };

    expect(await resolveSession(store, deps)).toBeNull();
    expect(deletes).toEqual(
      expect.arrayContaining([ACCESS_COOKIE, REFRESH_COOKIE]),
    );
  });

  it('does not swallow non-auth (500) errors from /me', async () => {
    const { store } = memStore({ [ACCESS_COOKIE]: 'good', [REFRESH_COOKIE]: 'r' });
    const deps: SessionDeps = {
      fetchCurrentUser: vi.fn(async () => {
        throw new ApiAuthError('server error', 500);
      }),
      refresh: vi.fn(),
    };

    await expect(resolveSession(store, deps)).rejects.toMatchObject({
      status: 500,
    });
    expect(deps.refresh).not.toHaveBeenCalled();
  });
});

describe('cookieOptions', () => {
  it('is httpOnly, lax, and not secure in development', () => {
    expect(cookieOptions(false)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
    });
  });

  it('is secure in production', () => {
    expect(cookieOptions(true).secure).toBe(true);
  });
});
