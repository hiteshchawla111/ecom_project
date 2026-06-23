import type { Role } from '../lib/types';

/** Roles permitted into the admin shell. CUSTOMER is rejected. */
const INTERNAL_ROLES: ReadonlySet<Role> = new Set<Role>(['ADMIN', 'INVENTORY_MANAGER']);

export function isInternalRole(role: Role): boolean {
  return INTERNAL_ROLES.has(role);
}

/** Roles permitted into the admin/seller shell at all. CUSTOMER is rejected. */
const SHELL_ROLES: ReadonlySet<Role> = new Set<Role>([
  'ADMIN',
  'INVENTORY_MANAGER',
  'SELLER',
]);

export function canEnterShell(role: Role): boolean {
  return SHELL_ROLES.has(role);
}
