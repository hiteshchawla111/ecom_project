import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { buildSellerScope } from './seller-scope';

describe('buildSellerScope', () => {
  it('scopes a SELLER to their own sellerId', () => {
    expect(buildSellerScope({ role: Role.SELLER, sellerId: 's1' })).toEqual({
      sellerId: 's1',
    });
  });

  it('returns an empty (unscoped) fragment for ADMIN', () => {
    expect(buildSellerScope({ role: Role.ADMIN })).toEqual({});
  });

  it('returns an empty (unscoped) fragment for INVENTORY_MANAGER', () => {
    expect(buildSellerScope({ role: Role.INVENTORY_MANAGER })).toEqual({});
  });

  it('fails closed when a SELLER actor has no sellerId (wiring error)', () => {
    expect(() => buildSellerScope({ role: Role.SELLER })).toThrow(
      ForbiddenException,
    );
  });
});
