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

type RefreshTokenData = { tokenHash: string; userId: string; expiresAt: Date };

/** Typed read of the first refreshToken.create call's `data` payload. */
const firstCreateData = (
  prisma: ReturnType<typeof prismaMock>,
): RefreshTokenData => {
  const [firstCall] = prisma.refreshToken.create.mock.calls as Array<
    [{ data: RefreshTokenData }]
  >;
  return firstCall[0].data;
};

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
    const token = await svc.signAccessToken({
      sub: 'u1',
      email: 'a@b.c',
      role: 'CUSTOMER',
    });
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
    const arg = firstCreateData(prisma);
    expect(arg.tokenHash).toBeDefined();
    expect(arg.tokenHash).not.toBe(raw);
    expect(arg.userId).toBe('u1');
  });

  it('rotateRefreshToken revokes the old record and issues a new one', async () => {
    const prisma = prismaMock();
    const { svc } = build(prisma);
    const raw = await svc.issueRefreshToken('u1');
    const stored = firstCreateData(prisma);
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      tokenHash: stored.tokenHash,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    const next = await svc.rotateRefreshToken(raw);
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        data: expect.objectContaining({
          revokedAt: expect.any(Date) as unknown,
        }) as unknown,
      }),
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
