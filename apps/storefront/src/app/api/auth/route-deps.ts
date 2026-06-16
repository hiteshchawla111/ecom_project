import 'server-only';
import { cookies } from 'next/headers';
import {
  confirmReset as apiConfirmReset,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  requestReset as apiRequestReset,
} from '@/lib/api-auth';
import { apiBaseUrl } from '@/lib/env';
import {
  REFRESH_COOKIE,
  clearSession,
  setSession,
} from '@/lib/session';
import type { RouteDeps } from './handlers';

/** Production wiring: real API client + cookie-backed session. */
export function liveRouteDeps(): RouteDeps {
  const baseUrl = apiBaseUrl();
  return {
    register: (input) => apiRegister(input, { baseUrl }),
    login: (input) => apiLogin(input, { baseUrl }),
    logout: (refreshToken) => apiLogout(refreshToken, { baseUrl }),
    setSession,
    clearSession,
    getRefreshToken: async () => {
      const store = await cookies();
      return store.get(REFRESH_COOKIE)?.value;
    },
    requestReset: (email) => apiRequestReset(email, { baseUrl }),
    confirmReset: (token, password) =>
      apiConfirmReset(token, password, { baseUrl }),
  };
}
