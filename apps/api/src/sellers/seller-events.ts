/**
 * seller-events.ts
 *
 * Domain event constants and payload interfaces for the Seller domain.
 * Emitted via EventEmitter2 after successful transactions — never inline
 * inside request handlers.
 */

/** Fired when a user successfully registers as a (pending-review) seller. */
export const SELLER_REGISTERED = 'seller.registered';

/** Fired when an admin approves a seller's KYC. */
export const SELLER_KYC_APPROVED = 'seller.kyc.approved';

/** Fired when an admin rejects a seller's KYC. */
export const SELLER_KYC_REJECTED = 'seller.kyc.rejected';

/** Payload for SELLER_REGISTERED. */
export interface SellerRegisteredEvent {
  sellerId: string;
  userId: string;
  displayName: string;
}

/** Payload for SELLER_KYC_APPROVED / SELLER_KYC_REJECTED. */
export interface SellerKycEvent {
  sellerId: string;
  userId: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  reason?: string;
}
