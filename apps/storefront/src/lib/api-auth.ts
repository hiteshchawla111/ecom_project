/**
 * Typed client for the NestJS auth endpoints (`apps/api`). Server-side only —
 * the browser never calls these directly; Next route handlers proxy through here.
 *
 * The contract mirrors `apps/api/src/auth` (TokenPair, AccessTokenPayload).
 */

/** Customer roles, mirrors the Prisma `Role` enum used by the API. */
export type Role = 'CUSTOMER' | 'ADMIN' | 'INVENTORY_MANAGER';

/** Pair returned by register/login/refresh — mirrors API `TokenPair`. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Claims returned by `GET /auth/me` — mirrors API `AccessTokenPayload`. */
export interface CurrentUser {
  sub: string;
  email: string;
  role: Role;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/** Injectable dependencies so the client is unit-testable without a real server. */
export interface ApiAuthOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

/** Error carrying the API's HTTP status and a flattened message. */
export class ApiAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiAuthError';
  }
}

interface ApiErrorBody {
  message?: string | string[];
  error?: string;
}

async function request<T>(
  path: string,
  init: RequestInit,
  { baseUrl, fetch: fetchImpl = fetch }: ApiAuthOptions,
): Promise<T> {
  const res = await fetchImpl(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init.headers,
    },
  });

  const body = (await res.json().catch(() => null)) as unknown;

  if (!res.ok) {
    throw new ApiAuthError(messageFrom(body, res.status), res.status);
  }
  return body as T;
}

/** Turn a Nest exception body (string or string[] message) into one line. */
function messageFrom(body: unknown, status: number): string {
  const b = body as ApiErrorBody | null;
  if (b && Array.isArray(b.message)) return b.message.join(', ');
  if (b && typeof b.message === 'string') return b.message;
  if (b && typeof b.error === 'string') return b.error;
  return `Request failed with status ${status}`;
}

export function register(
  input: RegisterInput,
  opts: ApiAuthOptions,
): Promise<TokenPair> {
  return request<TokenPair>(
    '/auth/register',
    { method: 'POST', body: JSON.stringify(input) },
    opts,
  );
}

export function login(input: LoginInput, opts: ApiAuthOptions): Promise<TokenPair> {
  return request<TokenPair>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify(input) },
    opts,
  );
}

export function refresh(
  refreshToken: string,
  opts: ApiAuthOptions,
): Promise<TokenPair> {
  return request<TokenPair>(
    '/auth/refresh',
    { method: 'POST', body: JSON.stringify({ refreshToken }) },
    opts,
  );
}

export function logout(
  refreshToken: string,
  opts: ApiAuthOptions,
): Promise<{ ok: true }> {
  return request<{ ok: true }>(
    '/auth/logout',
    { method: 'POST', body: JSON.stringify({ refreshToken }) },
    opts,
  );
}

export function fetchCurrentUser(
  accessToken: string,
  opts: ApiAuthOptions,
): Promise<CurrentUser> {
  return request<CurrentUser>(
    '/auth/me',
    { method: 'GET', headers: { authorization: `Bearer ${accessToken}` } },
    opts,
  );
}

export function requestReset(
  email: string,
  opts: ApiAuthOptions,
): Promise<{ ok: true }> {
  return request<{ ok: true }>(
    '/auth/password-reset/request',
    { method: 'POST', body: JSON.stringify({ email }) },
    opts,
  );
}

export function confirmReset(
  token: string,
  password: string,
  opts: ApiAuthOptions,
): Promise<{ ok: true }> {
  return request<{ ok: true }>(
    '/auth/password-reset/confirm',
    { method: 'POST', body: JSON.stringify({ token, password }) },
    opts,
  );
}
