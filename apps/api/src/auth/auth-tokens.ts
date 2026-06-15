import { Role } from '@prisma/client';

/** Claims embedded in the access token. */
export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  role: Role;
}

/** Pair returned to clients after auth. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
