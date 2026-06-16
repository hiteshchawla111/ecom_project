import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiClient } from '../lib/apiClient';
import { tokenStore } from '../lib/tokenStore';
import type { AuthUser, TokenPair } from '../lib/types';

type AuthStatus = 'loading' | 'authed' | 'guest';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  // Boot: resolve identity from a stored token, if any.
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!tokenStore.get()) {
        if (!cancelled) setStatus('guest');
        return;
      }
      try {
        const me = await apiClient.request<AuthUser>('/auth/me');
        if (cancelled) return;
        setUser(me);
        setStatus('authed');
      } catch {
        if (cancelled) return;
        tokenStore.clear();
        setUser(null);
        setStatus('guest');
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const pair = await apiClient.request<TokenPair>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    tokenStore.set(pair);
    const me = await apiClient.request<AuthUser>('/auth/me');
    setUser(me);
    setStatus('authed');
  }, []);

  const logout = useCallback(async () => {
    const tokens = tokenStore.get();
    if (tokens) {
      try {
        await apiClient.request('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
      } catch {
        // best-effort: revoke server-side if we can, but always clear locally
      }
    }
    tokenStore.clear();
    setUser(null);
    setStatus('guest');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout }),
    [status, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- colocated hook with its provider; only affects HMR granularity, not correctness
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
