# Phase 2 — API Authentication & Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `apps/api` auth core — customer register/login/logout/refresh, password-reset token endpoints (no email), and role-based guards — test-first.

**Architecture:** A self-contained NestJS `AuthModule` with thin controller + focused services (`AuthService`, `TokenService`, `PasswordService`), a passport-jwt strategy, and `JwtAuthGuard` (global) + `RolesGuard`. JWT access + rotating refresh tokens; refresh and reset tokens stored only as bcrypt hashes in two new Prisma models.

**Tech Stack:** NestJS 11, `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `bcrypt`, Prisma 7 (`@prisma/adapter-pg`), Jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-06-15-phase2-api-auth-design.md`

**Conventions to honor**
- All commands from repo root use `npm --prefix apps/api ...` (shell cwd resets between calls).
- Tests are `*.spec.ts` under `src/`, run via `npm --prefix apps/api test`. Mirror `src/orders/order-status.spec.ts` style.
- Money/dates aside, follow existing Prisma conventions: `cuid()` ids, `@@index` on FKs.
- Code enum `Role` comes from `@prisma/client` (UPPERCASE: `CUSTOMER`, `ADMIN`, `INVENTORY_MANAGER`).
- DBs: `ecom_dev` (+ `ecom_shadow`). Never touch `ecomm`.
- **After each task: update `PLAN.md` checkboxes/status, then STOP for user verification (RULE.md §1).**

---

## File Structure

**Create:**
- `src/auth/auth.module.ts` (replace skeleton)
- `src/auth/auth.controller.ts`
- `src/auth/auth.service.ts`
- `src/auth/token.service.ts`
- `src/auth/password.service.ts`
- `src/auth/auth-tokens.ts` (TS types: JWT payloads, token-pair result)
- `src/auth/dto/{register,login,refresh,request-reset,confirm-reset}.dto.ts`
- `src/auth/strategies/jwt.strategy.ts`
- `src/auth/guards/{jwt-auth.guard.ts,roles.guard.ts}`
- `src/auth/decorators/{roles.decorator.ts,public.decorator.ts,current-user.decorator.ts}`
- Spec files alongside each unit per the test plan.

**Modify:**
- `prisma/schema.prisma` — add `RefreshToken`, `PasswordResetToken`, User back-relations.
- `apps/api/.env.example` and `apps/api/.env` — JWT/reset config.
- `src/main.ts` — global `ValidationPipe`.
- `src/app.module.ts` — (AuthModule already imported; no change expected).
- `PLAN.md` — checkboxes/status.

---

## Task 0: Install dependencies & add auth config

**Files:** Modify `apps/api/package.json` (via npm), `apps/api/.env`, `apps/api/.env.example`

- [ ] **Step 1: Install runtime + dev deps**

Run:
```bash
npm --prefix apps/api install @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt
npm --prefix apps/api install -D @types/passport-jwt @types/bcrypt
```
Expected: installs succeed, `package.json` updated.

- [ ] **Step 2: Append auth config to `.env.example`**

Add to `apps/api/.env.example`:
```bash
# Auth (Phase 2). Use long random strings for secrets in real envs.
JWT_ACCESS_SECRET="dev-access-secret-change-me"
JWT_REFRESH_SECRET="dev-refresh-secret-change-me"
JWT_ACCESS_TTL="15m"
JWT_REFRESH_TTL="7d"
PASSWORD_RESET_TTL="1h"
```

- [ ] **Step 3: Mirror the same keys into `.env`** (gitignored) so the app boots locally. Use the same dev values.

- [ ] **Step 4: Commit**
```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/.env.example
git commit -m "chore(auth): add JWT/passport/bcrypt deps and auth config"
```
(Do NOT add `.env` — it is gitignored.)

---

## Task 1: Prisma models for token storage

**Files:** Modify `prisma/schema.prisma`; create migration `add_auth_tokens`

- [ ] **Step 1: Add models + User back-relations to `prisma/schema.prisma`**

In the `User` model, add these two relation fields (alongside `addresses`, `carts`, ...):
```prisma
  refreshTokens       RefreshToken[]
  passwordResetTokens PasswordResetToken[]
```

After the `Address` model (still in the Auth & users section), add:
```prisma
model RefreshToken {
  id        String    @id @default(cuid())
  tokenHash String    @unique
  user      User      @relation(fields: [userId], references: [id])
  userId    String
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}

model PasswordResetToken {
  id        String    @id @default(cuid())
  tokenHash String    @unique
  user      User      @relation(fields: [userId], references: [id])
  userId    String
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}
```

- [ ] **Step 2: Create and apply the migration**

Run:
```bash
npm --prefix apps/api exec -- prisma migrate dev --name add_auth_tokens
```
Expected: a new folder under `prisma/migrations/*_add_auth_tokens`, applied to `ecom_dev`, client regenerated. NOTE: `migrate dev` resets only on drift — confirm output says "applied" not "reset"; if it warns about reset, stop and investigate (do not lose seed data).

- [ ] **Step 3: Verify client types**

Run:
```bash
npm --prefix apps/api exec -- tsc --noEmit -p apps/api/tsconfig.json
```
Expected: no errors (the generated client now knows `prisma.refreshToken` / `prisma.passwordResetToken`).

- [ ] **Step 4: Commit**
```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(auth): add RefreshToken and PasswordResetToken models + migration"
```

---

## Task 2: PasswordService (bcrypt) — TDD

**Files:** Create `src/auth/password.service.ts`, `src/auth/password.service.spec.ts`

- [ ] **Step 1: Write the failing test** — `src/auth/password.service.spec.ts`
```ts
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const svc = new PasswordService();

  it('hashes a password to something other than the plaintext', async () => {
    const hash = await svc.hash('s3cret!');
    expect(hash).not.toBe('s3cret!');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('compare returns true for the correct password', async () => {
    const hash = await svc.hash('s3cret!');
    await expect(svc.compare('s3cret!', hash)).resolves.toBe(true);
  });

  it('compare returns false for a wrong password', async () => {
    const hash = await svc.hash('s3cret!');
    await expect(svc.compare('nope', hash)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
Run: `npm --prefix apps/api test -- password.service`
Expected: FAIL (cannot find `./password.service`).

- [ ] **Step 3: Implement** — `src/auth/password.service.ts`
```ts
import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const ROUNDS = 10;

/** Bcrypt hashing for passwords and opaque tokens. */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, ROUNDS);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
```

- [ ] **Step 4: Run — expect PASS**
Run: `npm --prefix apps/api test -- password.service`
Expected: 3 passing.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/auth/password.service.ts apps/api/src/auth/password.service.spec.ts
git commit -m "feat(auth): PasswordService with bcrypt hash/compare"
```

---

## Task 3: Auth token types + TokenService — TDD

**Files:** Create `src/auth/auth-tokens.ts`, `src/auth/token.service.ts`, `src/auth/token.service.spec.ts`

- [ ] **Step 1: Define shared types** — `src/auth/auth-tokens.ts`
```ts
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
```

- [ ] **Step 2: Write the failing test** — `src/auth/token.service.spec.ts`
```ts
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenService } from './token.service';
import { PasswordService } from './password.service';

const config = (overrides: Record<string, string> = {}) =>
  ({
    get: (k: string) =>
      ({
        JWT_ACCESS_SECRET: 'a',
        JWT_REFRESH_SECRET: 'r',
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '7d',
        ...overrides,
      })[k],
  }) as unknown as ConfigService;

const prismaMock = () => ({
  refreshToken: {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
});

const build = (prisma = prismaMock()) => {
  const svc = new TokenService(
    new JwtService({}),
    config(),
    new PasswordService(),
    prisma as never,
  );
  return { svc, prisma };
};

describe('TokenService', () => {
  it('signs an access token that verifies and carries the payload', async () => {
    const { svc } = build();
    const token = await svc.signAccessToken({ sub: 'u1', email: 'a@b.c', role: 'CUSTOMER' as never });
    const decoded = await svc.verifyAccessToken(token);
    expect(decoded.sub).toBe('u1');
    expect(decoded.role).toBe('CUSTOMER');
  });

  it('rejects a tampered access token', async () => {
    const { svc } = build();
    await expect(svc.verifyAccessToken('not.a.token')).rejects.toBeDefined();
  });

  it('issueRefreshToken persists a hash (not the raw token)', async () => {
    const { svc, prisma } = build();
    const raw = await svc.issueRefreshToken('u1');
    expect(typeof raw).toBe('string');
    const arg = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(arg.tokenHash).toBeDefined();
    expect(arg.tokenHash).not.toBe(raw);
    expect(arg.userId).toBe('u1');
  });

  it('rotateRefreshToken revokes the old record and issues a new one', async () => {
    const prisma = prismaMock();
    const { svc } = build(prisma);
    const raw = await svc.issueRefreshToken('u1');
    const stored = prisma.refreshToken.create.mock.calls[0][0].data;
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      tokenHash: stored.tokenHash,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    const next = await svc.rotateRefreshToken(raw);
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't1' }, data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    );
    expect(next.userId).toBe('u1');
    expect(typeof next.refreshToken).toBe('string');
  });

  it('rotateRefreshToken rejects a revoked/unknown token', async () => {
    const prisma = prismaMock();
    const { svc } = build(prisma);
    prisma.refreshToken.findUnique.mockResolvedValue(null);
    await expect(svc.rotateRefreshToken('whatever')).rejects.toBeDefined();
  });
});
```

- [ ] **Step 3: Run — expect FAIL**
Run: `npm --prefix apps/api test -- token.service`
Expected: FAIL (cannot find `./token.service`).

- [ ] **Step 4: Implement** — `src/auth/token.service.ts`
```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { AccessTokenPayload } from './auth-tokens';

interface RotateResult {
  userId: string;
  refreshToken: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
    private readonly prisma: PrismaService,
  ) {}

  signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
    });
  }

  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  /** Issue an opaque refresh token; store only its hash. Returns the raw token. */
  async issueRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(48).toString('hex');
    const tokenHash = await this.passwords.hash(raw);
    const ttlDays = this.parseDays(this.config.get<string>('JWT_REFRESH_TTL') ?? '7d');
    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId,
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });
    return raw;
  }

  /** Validate a raw refresh token, revoke it, and issue a replacement. */
  async rotateRefreshToken(raw: string): Promise<RotateResult> {
    const record = await this.findValidRefreshToken(raw);
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    const refreshToken = await this.issueRefreshToken(record.userId);
    return { userId: record.userId, refreshToken };
  }

  async revokeRefreshToken(raw: string): Promise<void> {
    const record = await this.findValidRefreshToken(raw).catch(() => null);
    if (record) {
      await this.prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async findValidRefreshToken(raw: string) {
    const tokenHash = await this.passwords.hash(raw); // see note below
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return record;
  }

  private parseDays(ttl: string): number {
    const m = /^(\d+)d$/.exec(ttl);
    return m ? Number(m[1]) : 7;
  }
}
```

> **Implementation note for the engineer:** bcrypt hashes are salted, so `hash(raw)` will NOT reproduce the stored hash — `findUnique({ where: { tokenHash } })` cannot work with a re-hash. Resolve in Step 4a before moving on.

- [ ] **Step 4a: Fix token lookup to use a deterministic hash**

bcrypt is non-deterministic; use a SHA-256 digest for the lookup key (refresh tokens are high-entropy random, so a fast digest is appropriate — bcrypt is for low-entropy passwords). Replace `findValidRefreshToken` and the hashing in `issueRefreshToken` to use a deterministic digest:

```ts
import { randomBytes, createHash } from 'crypto';
// ...
private digest(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
```
- In `issueRefreshToken`: `const tokenHash = this.digest(raw);` (remove the bcrypt call).
- In `findValidRefreshToken`: `const tokenHash = this.digest(raw);`

Update the spec's expectation accordingly: `tokenHash` is the sha256 digest of `raw`, still `!== raw`. The existing assertions (`tokenHash` defined and `!== raw`) remain valid.

- [ ] **Step 5: Run — expect PASS**
Run: `npm --prefix apps/api test -- token.service`
Expected: all passing.

- [ ] **Step 6: Commit**
```bash
git add apps/api/src/auth/auth-tokens.ts apps/api/src/auth/token.service.ts apps/api/src/auth/token.service.spec.ts
git commit -m "feat(auth): TokenService — sign/verify JWT, issue/rotate/revoke refresh tokens"
```

---

## Task 4: DTOs

**Files:** Create the five DTO files under `src/auth/dto/`

- [ ] **Step 1: Create DTOs**

`src/auth/dto/register.dto.ts`
```ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  name!: string;
}
```

`src/auth/dto/login.dto.ts`
```ts
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
```

`src/auth/dto/refresh.dto.ts`
```ts
import { IsString } from 'class-validator';

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}
```

`src/auth/dto/request-reset.dto.ts`
```ts
import { IsEmail } from 'class-validator';

export class RequestResetDto {
  @IsEmail()
  email!: string;
}
```

`src/auth/dto/confirm-reset.dto.ts`
```ts
import { IsString, MinLength } from 'class-validator';

export class ConfirmResetDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
```

- [ ] **Step 2: Install class-validator/transformer if absent**
Run:
```bash
npm --prefix apps/api install class-validator class-transformer
```

- [ ] **Step 3: Commit**
```bash
git add apps/api/src/auth/dto apps/api/package.json apps/api/package-lock.json
git commit -m "feat(auth): request DTOs with class-validator rules"
```

---

## Task 5: Decorators + RolesGuard + JwtAuthGuard — TDD on the guard

**Files:** Create decorators, guards, `src/auth/guards/roles.guard.spec.ts`

- [ ] **Step 1: Create decorators**

`src/auth/decorators/public.decorator.ts`
```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

`src/auth/decorators/roles.decorator.ts`
```ts
import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

`src/auth/decorators/current-user.decorator.ts`
```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AccessTokenPayload } from '../auth-tokens';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenPayload =>
    ctx.switchToHttp().getRequest().user,
);
```

- [ ] **Step 2: Write the failing guard test** — `src/auth/guards/roles.guard.spec.ts`
```ts
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

const ctxWith = (user: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as unknown as ExecutionContext;

const guardWith = (required: string[] | undefined) => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
  return new RolesGuard(reflector);
};

describe('RolesGuard', () => {
  it('allows when no roles are required', () => {
    expect(guardWith(undefined).canActivate(ctxWith({ role: 'CUSTOMER' }))).toBe(true);
  });

  it('allows when the user role matches', () => {
    expect(guardWith(['ADMIN']).canActivate(ctxWith({ role: 'ADMIN' }))).toBe(true);
  });

  it('denies when the user role does not match', () => {
    expect(guardWith(['ADMIN']).canActivate(ctxWith({ role: 'CUSTOMER' }))).toBe(false);
  });

  it('denies when there is no authenticated user', () => {
    expect(guardWith(['ADMIN']).canActivate(ctxWith(undefined))).toBe(false);
  });
});
```

- [ ] **Step 3: Run — expect FAIL**
Run: `npm --prefix apps/api test -- roles.guard`
Expected: FAIL (cannot find `./roles.guard`).

- [ ] **Step 4: Implement guards**

`src/auth/guards/jwt-auth.guard.ts`
```ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/** Global authentication guard; routes opt out with @Public(). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

`src/auth/guards/roles.guard.ts`
```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const { user } = context.switchToHttp().getRequest();
    return !!user && required.includes(user.role);
  }
}
```

- [ ] **Step 5: Run — expect PASS**
Run: `npm --prefix apps/api test -- roles.guard`
Expected: 4 passing.

- [ ] **Step 6: Commit**
```bash
git add apps/api/src/auth/decorators apps/api/src/auth/guards
git commit -m "feat(auth): Public/Roles/CurrentUser decorators + JwtAuthGuard + RolesGuard"
```

---

## Task 6: JwtStrategy — TDD

**Files:** Create `src/auth/strategies/jwt.strategy.ts`, `src/auth/strategies/jwt.strategy.spec.ts`

- [ ] **Step 1: Write the failing test** — `src/auth/strategies/jwt.strategy.spec.ts`
```ts
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

const config = { get: () => 'a' } as unknown as ConfigService;
const prismaMock = (user: unknown) =>
  ({ user: { findUnique: jest.fn().mockResolvedValue(user) } }) as never;

describe('JwtStrategy.validate', () => {
  const payload = { sub: 'u1', email: 'a@b.c', role: 'CUSTOMER' };

  it('returns the payload for an active, existing user', async () => {
    const strat = new JwtStrategy(config, prismaMock({ id: 'u1', isActive: true, deletedAt: null }));
    await expect(strat.validate(payload as never)).resolves.toMatchObject({ sub: 'u1' });
  });

  it('rejects when the user does not exist', async () => {
    const strat = new JwtStrategy(config, prismaMock(null));
    await expect(strat.validate(payload as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an inactive user', async () => {
    const strat = new JwtStrategy(config, prismaMock({ id: 'u1', isActive: false, deletedAt: null }));
    await expect(strat.validate(payload as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a soft-deleted user', async () => {
    const strat = new JwtStrategy(config, prismaMock({ id: 'u1', isActive: true, deletedAt: new Date() }));
    await expect(strat.validate(payload as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
Run: `npm --prefix apps/api test -- jwt.strategy`
Expected: FAIL (cannot find `./jwt.strategy`).

- [ ] **Step 3: Implement** — `src/auth/strategies/jwt.strategy.ts`
```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenPayload } from '../auth-tokens';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET') as string,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AccessTokenPayload> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException();
    }
    return payload;
  }
}
```

- [ ] **Step 4: Run — expect PASS**
Run: `npm --prefix apps/api test -- jwt.strategy`
Expected: 4 passing.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/auth/strategies
git commit -m "feat(auth): passport-jwt strategy validating active, existing users"
```

---

## Task 7: AuthService — TDD (the core)

**Files:** Create `src/auth/auth.service.ts`, `src/auth/auth.service.spec.ts`

- [ ] **Step 1: Write the failing test** — `src/auth/auth.service.spec.ts`
```ts
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

const passwords = new PasswordService();

const makePrisma = () => ({
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  passwordResetToken: {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
});

const makeTokens = () => ({
  signAccessToken: jest.fn().mockResolvedValue('access'),
  issueRefreshToken: jest.fn().mockResolvedValue('refresh'),
  rotateRefreshToken: jest.fn(),
  revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
  revokeAllForUser: jest.fn().mockResolvedValue(undefined),
});

const build = () => {
  const prisma = makePrisma();
  const tokens = makeTokens();
  const svc = new AuthService(prisma as never, passwords, tokens as never, { digest: (r: string) => `d:${r}`, resetTtlMs: () => 3600000 } as never);
  return { svc, prisma, tokens };
};

describe('AuthService', () => {
  describe('register', () => {
    it('creates a CUSTOMER and returns tokens', async () => {
      const { svc, prisma, tokens } = build();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u1', email: 'a@b.c', role: 'CUSTOMER' });
      const res = await svc.register({ email: 'A@B.c', password: 'password1', name: 'Al' });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: 'a@b.c', role: 'CUSTOMER' }) }),
      );
      expect(res).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
      expect(tokens.signAccessToken).toHaveBeenCalled();
    });

    it('rejects a duplicate email with 409', async () => {
      const { svc, prisma } = build();
      prisma.user.findUnique.mockResolvedValue({ id: 'x' });
      await expect(svc.register({ email: 'a@b.c', password: 'password1', name: 'Al' })).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      const { svc, prisma } = build();
      const hash = await passwords.hash('password1');
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c', role: 'CUSTOMER', passwordHash: hash, isActive: true, deletedAt: null });
      await expect(svc.login({ email: 'a@b.c', password: 'password1' })).resolves.toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    });

    it('rejects an unknown email with the generic 401', async () => {
      const { svc, prisma } = build();
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(svc.login({ email: 'no@b.c', password: 'x' })).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a wrong password with the generic 401', async () => {
      const { svc, prisma } = build();
      const hash = await passwords.hash('password1');
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c', role: 'CUSTOMER', passwordHash: hash, isActive: true, deletedAt: null });
      await expect(svc.login({ email: 'a@b.c', password: 'wrong' })).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an inactive user', async () => {
      const { svc, prisma } = build();
      const hash = await passwords.hash('password1');
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: hash, isActive: false, deletedAt: null });
      await expect(svc.login({ email: 'a@b.c', password: 'password1' })).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rotates and returns a new pair', async () => {
      const { svc, prisma, tokens } = build();
      tokens.rotateRefreshToken.mockResolvedValue({ userId: 'u1', refreshToken: 'refresh2' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c', role: 'CUSTOMER', isActive: true, deletedAt: null });
      await expect(svc.refresh({ refreshToken: 'old' })).resolves.toEqual({ accessToken: 'access', refreshToken: 'refresh2' });
    });

    it('propagates rejection for an invalid refresh token', async () => {
      const { svc, tokens } = build();
      tokens.rotateRefreshToken.mockRejectedValue(new UnauthorizedException());
      await expect(svc.refresh({ refreshToken: 'bad' })).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes the presented refresh token', async () => {
      const { svc, tokens } = build();
      await svc.logout('rt');
      expect(tokens.revokeRefreshToken).toHaveBeenCalledWith('rt');
    });
  });

  describe('requestPasswordReset', () => {
    it('returns ok and creates a token when the user exists', async () => {
      const { svc, prisma } = build();
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
      await expect(svc.requestPasswordReset({ email: 'a@b.c' })).resolves.toEqual({ ok: true });
      expect(prisma.passwordResetToken.create).toHaveBeenCalled();
    });

    it('returns ok WITHOUT creating a token when the user does not exist (no enumeration)', async () => {
      const { svc, prisma } = build();
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(svc.requestPasswordReset({ email: 'no@b.c' })).resolves.toEqual({ ok: true });
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmPasswordReset', () => {
    it('sets the new password and revokes refresh tokens on a valid token', async () => {
      const { svc, prisma, tokens } = build();
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 't1', userId: 'u1', usedAt: null, expiresAt: new Date(Date.now() + 100000),
      });
      await expect(svc.confirmPasswordReset({ token: 'raw', password: 'newpassword1' })).resolves.toEqual({ ok: true });
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }));
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 't1' } }));
      expect(tokens.revokeAllForUser).toHaveBeenCalledWith('u1');
    });

    it('rejects an expired/used/unknown token with 400', async () => {
      const { svc, prisma } = build();
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(svc.confirmPasswordReset({ token: 'bad', password: 'newpassword1' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
Run: `npm --prefix apps/api test -- auth.service`
Expected: FAIL (cannot find `./auth.service`).

- [ ] **Step 3: Implement** — `src/auth/auth.service.ts`

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RequestResetDto } from './dto/request-reset.dto';
import { ConfirmResetDto } from './dto/confirm-reset.dto';
import { TokenPair } from './auth-tokens';

/** Small helper bundle so the service is unit-testable without ConfigService. */
export interface ResetHelpers {
  digest(raw: string): string;
  resetTtlMs(): number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly reset: ResetHelpers,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.prisma.user.create({
      data: { email, name: dto.name, passwordHash, role: Role.CUSTOMER },
    });
    return this.issuePair(user.id, user.email, user.role);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const generic = new UnauthorizedException('Invalid credentials');
    if (!user || !user.isActive || user.deletedAt) throw generic;
    const ok = await this.passwords.compare(dto.password, user.passwordHash);
    if (!ok) throw generic;
    return this.issuePair(user.id, user.email, user.role);
  }

  async refresh(dto: RefreshDto): Promise<TokenPair> {
    const { userId, refreshToken } = await this.tokens.rotateRefreshToken(dto.refreshToken);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { accessToken, refreshToken };
  }

  async logout(refreshToken: string): Promise<{ ok: true }> {
    await this.tokens.revokeRefreshToken(refreshToken);
    return { ok: true };
  }

  async requestPasswordReset(dto: RequestResetDto): Promise<{ ok: true }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      const raw = randomBytes(32).toString('hex');
      await this.prisma.passwordResetToken.create({
        data: {
          tokenHash: this.reset.digest(raw),
          userId: user.id,
          expiresAt: new Date(Date.now() + this.reset.resetTtlMs()),
        },
      });
      // Phase 6: emit a domain event here to deliver `raw` by email.
    }
    return { ok: true };
  }

  async confirmPasswordReset(dto: ConfirmResetDto): Promise<{ ok: true }> {
    const tokenHash = this.reset.digest(dto.token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    const passwordHash = await this.passwords.hash(dto.password);
    await this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await this.tokens.revokeAllForUser(record.userId);
    return { ok: true };
  }

  private async issuePair(id: string, email: string, role: Role): Promise<TokenPair> {
    const accessToken = await this.tokens.signAccessToken({ sub: id, email, role });
    const refreshToken = await this.tokens.issueRefreshToken(id);
    return { accessToken, refreshToken };
  }

  /** Default helpers used in the module wiring (uses crypto + config). */
  static resetHelpers(config: ConfigService): ResetHelpers {
    return {
      digest: (raw: string) => createHash('sha256').update(raw).digest('hex'),
      resetTtlMs: () => {
        const ttl = config.get<string>('PASSWORD_RESET_TTL') ?? '1h';
        const m = /^(\d+)h$/.exec(ttl);
        return (m ? Number(m[1]) : 1) * 60 * 60 * 1000;
      },
    };
  }
}
```

- [ ] **Step 4: Run — expect PASS**
Run: `npm --prefix apps/api test -- auth.service`
Expected: all passing.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts
git commit -m "feat(auth): AuthService — register/login/refresh/logout/password-reset"
```

---

## Task 8: AuthController + module wiring + global ValidationPipe

**Files:** Create `src/auth/auth.controller.ts`; replace `src/auth/auth.module.ts`; modify `src/main.ts`

- [ ] **Step 1: Controller** — `src/auth/auth.controller.ts`
```ts
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RequestResetDto } from './dto/request-reset.dto';
import { ConfirmResetDto } from './dto/confirm-reset.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AccessTokenPayload } from './auth-tokens';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto);
  }

  @HttpCode(200)
  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AccessTokenPayload) {
    return user;
  }

  @Public()
  @HttpCode(200)
  @Post('password-reset/request')
  requestReset(@Body() dto: RequestResetDto) {
    return this.auth.requestPasswordReset(dto);
  }

  @Public()
  @HttpCode(200)
  @Post('password-reset/confirm')
  confirmReset(@Body() dto: ConfirmResetDto) {
    return this.auth.confirmPasswordReset(dto);
  }
}
```

- [ ] **Step 2: Module** — replace `src/auth/auth.module.ts`
```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService, ResetHelpers } from './auth.service';
import { TokenService } from './token.service';
import { PasswordService } from './password.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [PrismaModule, PassportModule, ConfigModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    PasswordService,
    JwtStrategy,
    {
      provide: 'RESET_HELPERS',
      useFactory: (config: ConfigService): ResetHelpers => AuthService.resetHelpers(config),
      inject: [ConfigService],
    },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
```

> **Wiring note:** `AuthService`'s 4th constructor arg is the `ResetHelpers`. Add `@Inject('RESET_HELPERS')` to that parameter in `auth.service.ts`:
> ```ts
> import { Inject } from '@nestjs/common';
> // ...
> constructor(
>   private readonly prisma: PrismaService,
>   private readonly passwords: PasswordService,
>   private readonly tokens: TokenService,
>   @Inject('RESET_HELPERS') private readonly reset: ResetHelpers,
> ) {}
> ```
> The unit test in Task 7 passes the helpers positionally, which still works.

- [ ] **Step 3: Global ValidationPipe** — modify `src/main.ts`
```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 4: Build + full test run**
Run:
```bash
npm --prefix apps/api run build
npm --prefix apps/api test
```
Expected: build succeeds; all spec files pass (existing 17 + new auth specs).

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/auth/auth.controller.ts apps/api/src/auth/auth.module.ts apps/api/src/auth/auth.service.ts apps/api/src/main.ts
git commit -m "feat(auth): controller, module wiring, global ValidationPipe"
```

---

## Task 9: Smoke check against ecom_dev + update PLAN.md

**Files:** Modify `PLAN.md`

- [ ] **Step 1: Boot the API against `ecom_dev`**
Run (background, then probe):
```bash
npm --prefix apps/api run start:dev
```
In a second shell, once it logs "Nest application successfully started":
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
curl -s -X POST http://localhost:3000/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"smoke@example.com","password":"password1","name":"Smoke"}' -w "\n%{http_code}\n"
curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"smoke@example.com","password":"password1"}' -w "\n%{http_code}\n"
```
Expected: `/` → 200; register → JSON with `accessToken`/`refreshToken` + 201; login → tokens + 200. Then stop the dev server.

> If `smoke@example.com` already exists from a prior run, register returns 409 — that still proves the path. Use a fresh email or delete the row via `prisma studio`.

- [ ] **Step 2: Update `PLAN.md`**
- Tick the Phase 2 API checkbox:
  `- [x] API: customer register/login/logout/password-reset/profile; admin secure login; session/JWT; role-based guards (Customer / Admin / Inventory Manager).`
  (Leave storefront/admin sub-items unchecked — they are later slices.)
- In the **Phase status** table, set Phase 2 to `🟡 In Progress (API auth ✅; storefront/admin pending)`.
- Update **Current focus** to note API auth done, next is storefront auth (and the FE-test-runner gap).

- [ ] **Step 3: Commit**
```bash
git add PLAN.md
git commit -m "docs(plan): mark Phase 2 API auth done; storefront/admin pending"
```

- [ ] **Step 4: STOP — ask the user to verify** this slice before starting storefront auth (RULE.md §1).

---

## Self-Review notes

- **Spec coverage:** register/login/logout/refresh/me/reset endpoints (Tasks 7–8), JWT access+refresh with rotation & hashed-at-rest storage (Task 3), CUSTOMER-only registration (Task 7), non-enumerating login & reset (Task 7), global JwtAuthGuard + RolesGuard + @Public/@Roles (Tasks 5,8), inactive/deleted rejection (Tasks 6,7), ValidationPipe & error mapping (Tasks 7,8), token models + migration (Task 1), config (Task 0). All spec sections map to a task.
- **Deterministic token hashing:** refresh + reset tokens use SHA-256 digest (not bcrypt) so `findUnique` lookups work — flagged explicitly in Task 3 (Step 4a) and used consistently in Task 7.
- **Type consistency:** `TokenPair`, `AccessTokenPayload`, `ResetHelpers`, `RotateResult`, `digest`/`resetTtlMs` names are consistent across Tasks 3, 7, 8.
- **DI note:** `RESET_HELPERS` provider + `@Inject` is the one piece an engineer could miss; called out in Task 8.
- **P2002 mapping:** register pre-checks email and throws `ConflictException`; the DB unique constraint is the backstop. (A concurrent-insert race would surface as a raw Prisma error; acceptable for this slice — note for Phase 7 hardening.)
- **Follow-up:** HTTP E2E tests deferred with the Phase 0 FE-test-runner gap (per spec).
