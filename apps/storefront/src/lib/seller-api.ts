import 'server-only';
import { ApiAuthError } from './api-auth';
import { authedRequest, type AuthedApiDeps } from './api-authed';
import type { SellerView, RegisterSellerInput, UpdateSellerInput } from './seller';

interface SellerApiOptions {
  baseUrl: string;
  accessToken: string;
  fetch?: typeof fetch;
}

interface ApiErrorBody {
  message?: string | string[];
  error?: string;
}

function messageFrom(body: unknown, status: number): string {
  const b = body as ApiErrorBody | null;
  if (b && Array.isArray(b.message)) return b.message.join(', ');
  if (b && typeof b.message === 'string') return b.message;
  if (b && typeof b.error === 'string') return b.error;
  return `Request failed with status ${status}`;
}

async function sellerRequest<T>(
  path: string,
  init: RequestInit,
  opts: SellerApiOptions,
): Promise<T> {
  const fetchImpl = opts.fetch ?? fetch;
  const res = await fetchImpl(`${opts.baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${opts.accessToken}`,
      ...init.headers,
    },
  });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new ApiAuthError(messageFrom(body, res.status), res.status);
  return body as T;
}

export function registerSeller(
  input: RegisterSellerInput,
  opts: SellerApiOptions,
): Promise<SellerView> {
  return sellerRequest<SellerView>(
    '/seller/register',
    { method: 'POST', body: JSON.stringify(input) },
    opts,
  );
}

export function getSellerMe(deps: AuthedApiDeps): Promise<SellerView> {
  return authedRequest<SellerView>('/seller/me', { method: 'GET' }, deps);
}

export function updateSellerMe(
  input: UpdateSellerInput,
  deps: AuthedApiDeps,
): Promise<SellerView> {
  return authedRequest<SellerView>(
    '/seller/me',
    { method: 'PATCH', body: JSON.stringify(input) },
    deps,
  );
}
