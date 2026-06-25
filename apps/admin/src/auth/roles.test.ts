import { describe, it, expect } from 'vitest';
import { isInternalRole, canEnterShell } from './roles';

describe('isInternalRole', () => {
  it('accepts ADMIN', () => expect(isInternalRole('ADMIN')).toBe(true));
  it('accepts INVENTORY_MANAGER', () =>
    expect(isInternalRole('INVENTORY_MANAGER')).toBe(true));
  it('rejects CUSTOMER', () => expect(isInternalRole('CUSTOMER')).toBe(false));
});

describe('canEnterShell', () => {
  it('admits ADMIN, INVENTORY_MANAGER and SELLER', () => {
    expect(canEnterShell('ADMIN')).toBe(true);
    expect(canEnterShell('INVENTORY_MANAGER')).toBe(true);
    expect(canEnterShell('SELLER')).toBe(true);
  });
  it('rejects CUSTOMER', () => {
    expect(canEnterShell('CUSTOMER')).toBe(false);
  });
});

describe('isInternalRole (unchanged — SELLER is not internal)', () => {
  it('does not treat SELLER as internal', () => {
    expect(isInternalRole('SELLER')).toBe(false);
  });
});
