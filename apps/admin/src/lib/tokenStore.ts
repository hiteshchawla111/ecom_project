import type { TokenPair } from './types';

const KEY = 'admin.auth';

/** The single point of localStorage access for the session token pair. */
export const tokenStore = {
  get(): TokenPair | null {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<TokenPair>;
      if (
        typeof parsed.accessToken === 'string' &&
        typeof parsed.refreshToken === 'string'
      ) {
        return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
      }
    } catch {
      // fall through to clear + null
    }
    localStorage.removeItem(KEY);
    return null;
  },

  set(pair: TokenPair): void {
    localStorage.setItem(KEY, JSON.stringify(pair));
  },

  clear(): void {
    localStorage.removeItem(KEY);
  },
};
