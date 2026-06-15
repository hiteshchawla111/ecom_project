import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
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
  const svc = new AuthService(prisma as never, passwords, tokens as never, {
    digest: (r: string) => `d:${r}`,
    resetTtlMs: () => 3600000,
  });
  return { svc, prisma, tokens };
};

describe('AuthService', () => {
  describe('register', () => {
    it('creates a CUSTOMER and returns tokens', async () => {
      const { svc, prisma, tokens } = build();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'u1',
        email: 'a@b.c',
        role: 'CUSTOMER',
      });
      const res = await svc.register({
        email: 'A@B.c',
        password: 'password1',
        name: 'Al',
      });
      const [firstCall] = prisma.user.create.mock.calls as Array<
        [{ data: { email: string; role: string } }]
      >;
      expect(firstCall[0].data).toEqual(
        expect.objectContaining({ email: 'a@b.c', role: 'CUSTOMER' }),
      );
      expect(res).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
      expect(tokens.signAccessToken).toHaveBeenCalled();
    });

    it('rejects a duplicate email with 409', async () => {
      const { svc, prisma } = build();
      prisma.user.findUnique.mockResolvedValue({ id: 'x' });
      await expect(
        svc.register({ email: 'a@b.c', password: 'password1', name: 'Al' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      const { svc, prisma } = build();
      const hash = await passwords.hash('password1');
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.c',
        role: 'CUSTOMER',
        passwordHash: hash,
        isActive: true,
        deletedAt: null,
      });
      await expect(
        svc.login({ email: 'a@b.c', password: 'password1' }),
      ).resolves.toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    });

    it('rejects an unknown email with the generic 401', async () => {
      const { svc, prisma } = build();
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        svc.login({ email: 'no@b.c', password: 'x' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a wrong password with the generic 401', async () => {
      const { svc, prisma } = build();
      const hash = await passwords.hash('password1');
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.c',
        role: 'CUSTOMER',
        passwordHash: hash,
        isActive: true,
        deletedAt: null,
      });
      await expect(
        svc.login({ email: 'a@b.c', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an inactive user', async () => {
      const { svc, prisma } = build();
      const hash = await passwords.hash('password1');
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        passwordHash: hash,
        isActive: false,
        deletedAt: null,
      });
      await expect(
        svc.login({ email: 'a@b.c', password: 'password1' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rotates and returns a new pair', async () => {
      const { svc, prisma, tokens } = build();
      tokens.rotateRefreshToken.mockResolvedValue({
        userId: 'u1',
        refreshToken: 'refresh2',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.c',
        role: 'CUSTOMER',
        isActive: true,
        deletedAt: null,
      });
      await expect(svc.refresh({ refreshToken: 'old' })).resolves.toEqual({
        accessToken: 'access',
        refreshToken: 'refresh2',
      });
    });

    it('propagates rejection for an invalid refresh token', async () => {
      const { svc, tokens } = build();
      tokens.rotateRefreshToken.mockRejectedValue(new UnauthorizedException());
      await expect(svc.refresh({ refreshToken: 'bad' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
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
      await expect(
        svc.requestPasswordReset({ email: 'a@b.c' }),
      ).resolves.toEqual({ ok: true });
      expect(prisma.passwordResetToken.create).toHaveBeenCalled();
    });

    it('returns ok WITHOUT creating a token when the user does not exist (no enumeration)', async () => {
      const { svc, prisma } = build();
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        svc.requestPasswordReset({ email: 'no@b.c' }),
      ).resolves.toEqual({ ok: true });
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmPasswordReset', () => {
    it('sets the new password and revokes refresh tokens on a valid token', async () => {
      const { svc, prisma, tokens } = build();
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      await expect(
        svc.confirmPasswordReset({ token: 'raw', password: 'newpassword1' }),
      ).resolves.toEqual({ ok: true });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' } }),
      );
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 't1' } }),
      );
      expect(tokens.revokeAllForUser).toHaveBeenCalledWith('u1');
    });

    it('rejects an expired/used/unknown token with 400', async () => {
      const { svc, prisma } = build();
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(
        svc.confirmPasswordReset({ token: 'bad', password: 'newpassword1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
