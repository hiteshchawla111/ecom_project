/** Roles mirror the API's Prisma Role enum. */
export type Role = 'CUSTOMER' | 'ADMIN' | 'INVENTORY_MANAGER' | 'SELLER';

/** Authenticated user, as returned by GET /auth/me. */
export interface AuthUser {
  sub: string;
  email: string;
  role: Role;
}

/** Access + refresh token pair, as returned by login/refresh. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Thrown when the session can no longer be refreshed. */
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired');
    this.name = 'SessionExpiredError';
  }
}

/** Thrown for non-OK API responses (other than the handled 401-refresh path). */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}
