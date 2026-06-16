import { describe, it, expect } from 'vitest';
import { isInternalRole } from './roles';

describe('isInternalRole', () => {
  it('accepts ADMIN', () => expect(isInternalRole('ADMIN')).toBe(true));
  it('accepts INVENTORY_MANAGER', () =>
    expect(isInternalRole('INVENTORY_MANAGER')).toBe(true));
  it('rejects CUSTOMER', () => expect(isInternalRole('CUSTOMER')).toBe(false));
});
