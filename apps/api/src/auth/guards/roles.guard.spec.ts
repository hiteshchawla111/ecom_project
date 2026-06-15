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
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
};

describe('RolesGuard', () => {
  it('allows when no roles are required', () => {
    expect(
      guardWith(undefined).canActivate(ctxWith({ role: 'CUSTOMER' })),
    ).toBe(true);
  });

  it('allows when the user role matches', () => {
    expect(guardWith(['ADMIN']).canActivate(ctxWith({ role: 'ADMIN' }))).toBe(
      true,
    );
  });

  it('denies when the user role does not match', () => {
    expect(
      guardWith(['ADMIN']).canActivate(ctxWith({ role: 'CUSTOMER' })),
    ).toBe(false);
  });

  it('denies when there is no authenticated user', () => {
    expect(guardWith(['ADMIN']).canActivate(ctxWith(undefined))).toBe(false);
  });
});
