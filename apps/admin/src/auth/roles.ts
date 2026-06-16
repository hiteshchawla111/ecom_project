import type { Role } from '../lib/types';

/** Roles permitted into the admin shell. CUSTOMER is rejected. */
const INTERNAL_ROLES: ReadonlySet<Role> = new Set<Role>(['ADMIN', 'INVENTORY_MANAGER']);

export function isInternalRole(role: Role): boolean {
  return INTERNAL_ROLES.has(role);
}
