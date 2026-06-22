import type { SellerStatus } from './sellers';

/**
 * Valid next statuses for each seller status — mirrors the API's authoritative
 * state machine (`apps/api/src/sellers/seller-status.ts`). The UI offers only
 * these moves; the API still enforces them (this is UX, not the boundary).
 */
const ALLOWED: Record<SellerStatus, readonly SellerStatus[]> = {
  PENDING_REVIEW: ['ACTIVE', 'SUSPENDED'], // approve / reject
  ACTIVE: ['SUSPENDED', 'DEACTIVATED'],
  SUSPENDED: ['ACTIVE', 'DEACTIVATED'],
  DEACTIVATED: [],
};

/** The statuses a seller may transition into from `status`. */
export function nextStatuses(status: SellerStatus): readonly SellerStatus[] {
  return ALLOWED[status];
}
