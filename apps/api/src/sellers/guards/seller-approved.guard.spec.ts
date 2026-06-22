import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role, SellerStatus } from '@prisma/client';
import { AccessTokenPayload } from '../../auth/auth-tokens';
import { PrismaService } from '../../prisma/prisma.service';
import { SellerApprovedGuard } from './seller-approved.guard';

const ctxWith = (user: AccessTokenPayload | undefined): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const makePrisma = (
  result: { status: SellerStatus } | null,
): jest.Mocked<Pick<PrismaService, 'seller'>> => ({
  seller: {
    findUnique: jest.fn().mockResolvedValue(result),
  } as unknown as PrismaService['seller'],
});

describe('SellerApprovedGuard', () => {
  it('passes for ADMIN without querying the DB', async () => {
    const prisma = makePrisma(null);
    const guard = new SellerApprovedGuard(prisma as unknown as PrismaService);
    const ctx = ctxWith({
      sub: 'admin-1',
      email: 'admin@test.com',
      role: Role.ADMIN,
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.seller.findUnique).not.toHaveBeenCalled();
  });

  it('passes for SELLER whose DB status is ACTIVE', async () => {
    const prisma = makePrisma({ status: SellerStatus.ACTIVE });
    const guard = new SellerApprovedGuard(prisma as unknown as PrismaService);
    const ctx = ctxWith({
      sub: 'seller-1',
      email: 'seller@test.com',
      role: Role.SELLER,
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.seller.findUnique).toHaveBeenCalledWith({
      where: { userId: 'seller-1' },
      select: { status: true },
    });
  });

  it('throws ForbiddenException for SELLER whose DB status is PENDING_REVIEW', async () => {
    const prisma = makePrisma({ status: SellerStatus.PENDING_REVIEW });
    const guard = new SellerApprovedGuard(prisma as unknown as PrismaService);
    const ctx = ctxWith({
      sub: 'seller-2',
      email: 'seller2@test.com',
      role: Role.SELLER,
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException for SELLER whose DB status is SUSPENDED', async () => {
    const prisma = makePrisma({ status: SellerStatus.SUSPENDED });
    const guard = new SellerApprovedGuard(prisma as unknown as PrismaService);
    const ctx = ctxWith({
      sub: 'seller-3',
      email: 'seller3@test.com',
      role: Role.SELLER,
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException for SELLER whose DB status is DEACTIVATED', async () => {
    const prisma = makePrisma({ status: SellerStatus.DEACTIVATED });
    const guard = new SellerApprovedGuard(prisma as unknown as PrismaService);
    const ctx = ctxWith({
      sub: 'seller-4',
      email: 'seller4@test.com',
      role: Role.SELLER,
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when no Seller row exists in DB (token role SELLER)', async () => {
    const prisma = makePrisma(null);
    const guard = new SellerApprovedGuard(prisma as unknown as PrismaService);
    const ctx = ctxWith({
      sub: 'no-seller-row',
      email: 'ghost@test.com',
      role: Role.SELLER,
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when request has no authenticated user', async () => {
    const prisma = makePrisma(null);
    const guard = new SellerApprovedGuard(prisma as unknown as PrismaService);
    const ctx = ctxWith(undefined);

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.seller.findUnique).not.toHaveBeenCalled();
  });

  it('blocks a SUSPENDED seller regardless of token role (DB-authoritative)', async () => {
    // Token says SELLER, DB says SUSPENDED — DB wins
    const prisma = makePrisma({ status: SellerStatus.SUSPENDED });
    const guard = new SellerApprovedGuard(prisma as unknown as PrismaService);
    const ctx = ctxWith({
      sub: 'stale-token-seller',
      email: 'stale@test.com',
      role: Role.SELLER,
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.seller.findUnique).toHaveBeenCalledWith({
      where: { userId: 'stale-token-seller' },
      select: { status: true },
    });
  });
});
