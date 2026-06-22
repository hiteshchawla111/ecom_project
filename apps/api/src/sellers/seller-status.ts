/**
 * Seller status state machine.
 *
 *   PENDING_REVIEW → ACTIVE (approve) or SUSPENDED (reject-at-review; reason stored by caller)
 *   ACTIVE         → SUSPENDED (suspend) or DEACTIVATED (offboard)
 *   SUSPENDED      → ACTIVE (reinstate) or DEACTIVATED (offboard)
 *   DEACTIVATED    → (terminal)
 *
 * Pure logic — no DB, no framework. The single source of truth for which
 * seller-status transitions are legal. Services MUST guard transitions with
 * `assertTransition` before persisting a status change.
 *
 * Uses the Prisma `SellerStatus` enum directly as keys to avoid a duplicate
 * local enum and prevent `as unknown as` casts in service code.
 */

import { SellerStatus } from '@prisma/client';

/** Allowed next states for each status. Terminal states map to an empty list. */
const ALLOWED_TRANSITIONS: Readonly<
  Record<SellerStatus, readonly SellerStatus[]>
> = {
  [SellerStatus.PENDING_REVIEW]: [SellerStatus.ACTIVE, SellerStatus.SUSPENDED],
  [SellerStatus.ACTIVE]: [SellerStatus.SUSPENDED, SellerStatus.DEACTIVATED],
  [SellerStatus.SUSPENDED]: [SellerStatus.ACTIVE, SellerStatus.DEACTIVATED],
  [SellerStatus.DEACTIVATED]: [],
};

/** True if `from → to` is a legal transition. Same-state (no-op) is not allowed. */
export function canTransition(from: SellerStatus, to: SellerStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export class InvalidSellerTransitionError extends Error {
  constructor(
    public readonly from: SellerStatus,
    public readonly to: SellerStatus,
  ) {
    super(`Invalid seller status transition: ${from} → ${to}`);
    this.name = 'InvalidSellerTransitionError';
  }
}

/** Throws {@link InvalidSellerTransitionError} unless `from → to` is legal. */
export function assertTransition(from: SellerStatus, to: SellerStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidSellerTransitionError(from, to);
  }
}
