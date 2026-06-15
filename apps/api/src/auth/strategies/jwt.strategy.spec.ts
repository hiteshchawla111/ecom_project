import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

const config = { get: () => 'a' } as unknown as ConfigService;
const prismaMock = (user: unknown) =>
  ({ user: { findUnique: jest.fn().mockResolvedValue(user) } }) as never;

describe('JwtStrategy.validate', () => {
  const payload = { sub: 'u1', email: 'a@b.c', role: 'CUSTOMER' };

  it('returns the payload for an active, existing user', async () => {
    const strat = new JwtStrategy(
      config,
      prismaMock({ id: 'u1', isActive: true, deletedAt: null }),
    );
    await expect(strat.validate(payload as never)).resolves.toMatchObject({
      sub: 'u1',
    });
  });

  it('rejects when the user does not exist', async () => {
    const strat = new JwtStrategy(config, prismaMock(null));
    await expect(strat.validate(payload as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an inactive user', async () => {
    const strat = new JwtStrategy(
      config,
      prismaMock({ id: 'u1', isActive: false, deletedAt: null }),
    );
    await expect(strat.validate(payload as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a soft-deleted user', async () => {
    const strat = new JwtStrategy(
      config,
      prismaMock({ id: 'u1', isActive: true, deletedAt: new Date() }),
    );
    await expect(strat.validate(payload as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
