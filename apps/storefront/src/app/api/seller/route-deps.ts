import 'server-only';
import { cookies } from 'next/headers';
import { refresh as apiRefresh } from '@/lib/api-auth';
import { apiBaseUrl } from '@/lib/env';
import { liveAuthedDeps } from '@/lib/api-authed';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  cookieOptions,
} from '@/lib/session';
import {
  getSellerMe,
  registerSeller,
  updateSellerMe,
} from '@/lib/seller';
import type { SellerRouteDeps } from './handlers';

/** Production wiring: API client bound to the caller's access token + cookies. */
export async function liveSellerRouteDeps(): Promise<SellerRouteDeps> {
  const baseUrl = apiBaseUrl();
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value ?? '';
  const isProd = process.env.NODE_ENV === 'production';

  return {
    register: (input) => registerSeller(input, { baseUrl, accessToken }),
    getMe: async () => getSellerMe(await liveAuthedDeps()),
    update: async (input) => updateSellerMe(input, await liveAuthedDeps()),
    refreshSession: async () => {
      const refreshToken = store.get(REFRESH_COOKIE)?.value;
      if (!refreshToken) throw new Error('No refresh token');
      const pair = await apiRefresh(refreshToken, { baseUrl });
      // Route Handler context — cookie writes are allowed here.
      store.set(ACCESS_COOKIE, pair.accessToken, cookieOptions(isProd));
      store.set(REFRESH_COOKIE, pair.refreshToken, cookieOptions(isProd));
    },
  };
}
