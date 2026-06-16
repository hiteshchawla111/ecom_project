import {
  ApiAuthError,
  type LoginInput,
  type RegisterInput,
  type TokenPair,
} from '@/lib/api-auth';

/** Result of a route handler — serialized to a Response by the route adapter. */
export interface HandlerResult {
  status: number;
  body: unknown;
}

/** Injectable dependencies so handlers are unit-testable without Next/cookies. */
export interface RouteDeps {
  register(input: RegisterInput): Promise<TokenPair>;
  login(input: LoginInput): Promise<TokenPair>;
  logout(refreshToken: string): Promise<{ ok: true }>;
  setSession(pair: TokenPair): Promise<void>;
  clearSession(): Promise<void>;
  getRefreshToken(): Promise<string | undefined>;
  requestReset(email: string): Promise<{ ok: true }>;
  confirmReset(token: string, password: string): Promise<{ ok: true }>;
}

function badRequest(message: string): HandlerResult {
  return { status: 400, body: { message } };
}

/** Map an upstream API error to a client-facing result; rethrow the unexpected. */
function fromApiError(err: unknown): HandlerResult {
  if (err instanceof ApiAuthError) {
    return { status: err.status, body: { message: err.message } };
  }
  throw err;
}

export async function handleRegister(
  input: Partial<RegisterInput>,
  deps: RouteDeps,
): Promise<HandlerResult> {
  const email = input.email?.trim() ?? '';
  const password = input.password ?? '';
  const name = input.name?.trim() ?? '';
  if (!email || !password || !name) {
    return badRequest('Email, password, and name are required.');
  }
  try {
    const pair = await deps.register({ email, password, name });
    await deps.setSession(pair);
    return { status: 201, body: { ok: true } };
  } catch (err) {
    return fromApiError(err);
  }
}

export async function handleLogin(
  input: Partial<LoginInput>,
  deps: RouteDeps,
): Promise<HandlerResult> {
  const email = input.email?.trim() ?? '';
  const password = input.password ?? '';
  if (!email || !password) {
    return badRequest('Email and password are required.');
  }
  try {
    const pair = await deps.login({ email, password });
    await deps.setSession(pair);
    return { status: 200, body: { ok: true } };
  } catch (err) {
    return fromApiError(err);
  }
}

export async function handleLogout(deps: RouteDeps): Promise<HandlerResult> {
  const refreshToken = await deps.getRefreshToken();
  if (refreshToken) {
    // Best-effort revocation; clearing local cookies must happen regardless.
    try {
      await deps.logout(refreshToken);
    } catch {
      /* swallow — the session is being torn down anyway */
    }
  }
  await deps.clearSession();
  return { status: 200, body: { ok: true } };
}

export async function handleRequestReset(
  input: { email?: string },
  deps: RouteDeps,
): Promise<HandlerResult> {
  const email = input.email?.trim() ?? '';
  if (!email) {
    return badRequest('Email is required.');
  }
  try {
    // Enumeration-safe: the API returns { ok: true } regardless of existence.
    await deps.requestReset(email);
    return { status: 200, body: { ok: true } };
  } catch (err) {
    return fromApiError(err);
  }
}

export async function handleConfirmReset(
  input: { token?: string; password?: string },
  deps: RouteDeps,
): Promise<HandlerResult> {
  const token = input.token?.trim() ?? '';
  const password = input.password ?? '';
  if (!token) {
    return badRequest('Reset token is required.');
  }
  if (!password) {
    return badRequest('Password is required.');
  }
  if (password.length < 8) {
    return badRequest('Password must be at least 8 characters.');
  }
  try {
    await deps.confirmReset(token, password);
    return { status: 200, body: { ok: true } };
  } catch (err) {
    return fromApiError(err);
  }
}
