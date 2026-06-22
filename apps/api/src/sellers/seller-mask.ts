/**
 * seller-mask.ts
 *
 * Pure projection: converts a Seller DB record into a safe SellerView DTO.
 *
 * Security contract:
 *   - Callers pass DECRYPTED KYC values (gstin, pan, bankIfsc, bankAccountNo).
 *   - This function NEVER returns those raw values.
 *   - gstin / pan / bankIfsc  → presence booleans only.
 *   - bankAccountNo           → last-4 digits prefixed with '••••', or null if
 *                               the value is shorter than 4 chars or absent.
 */

import { Seller, SellerStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Output DTO
// ---------------------------------------------------------------------------

export interface SellerView {
  id: string;
  displayName: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  status: SellerStatus;
  kycVerifiedAt: Date | null;
  /** '••••1234' when last-4 is available; null otherwise. */
  bankAccountLast4: string | null;
  /** true iff gstin is a non-empty string. */
  gstinPresent: boolean;
  /** true iff pan is a non-empty string. */
  panPresent: boolean;
  /** true iff bankIfsc is a non-empty string. */
  bankIfscPresent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input type — only the fields this function reads
// ---------------------------------------------------------------------------

type SellerInput = Pick<
  Seller,
  | 'id'
  | 'displayName'
  | 'slug'
  | 'description'
  | 'logoUrl'
  | 'status'
  | 'kycVerifiedAt'
  | 'bankAccountNo'
  | 'gstin'
  | 'pan'
  | 'bankIfsc'
  | 'createdAt'
  | 'updatedAt'
>;

// ---------------------------------------------------------------------------
// Helpers (module-private)
// ---------------------------------------------------------------------------

const MASK_PREFIX = '••••';

/**
 * Returns the last-4-digit masked string, or null if the value is too short or
 * absent.  The caller must supply the DECRYPTED account number so the last-4
 * digits are meaningful.
 */
function maskAccountNumber(value: string | null | undefined): string | null {
  if (!value || value.length < 4) {
    return null;
  }
  return MASK_PREFIX + value.slice(-4);
}

/** Returns true iff the value is a non-empty string. */
function isPresent(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.length > 0;
}

// ---------------------------------------------------------------------------
// Public projection
// ---------------------------------------------------------------------------

/**
 * Converts a Seller record into a safe SellerView.
 *
 * IMPORTANT: call this function with DECRYPTED KYC values.  The raw values are
 * never forwarded to the output — only presence flags and a masked last-4 are
 * returned.
 */
export function toSellerView(seller: SellerInput): SellerView {
  return {
    id: seller.id,
    displayName: seller.displayName,
    slug: seller.slug,
    description: seller.description,
    logoUrl: seller.logoUrl,
    status: seller.status,
    kycVerifiedAt: seller.kycVerifiedAt,
    bankAccountLast4: maskAccountNumber(seller.bankAccountNo),
    gstinPresent: isPresent(seller.gstin),
    panPresent: isPresent(seller.pan),
    bankIfscPresent: isPresent(seller.bankIfsc),
    createdAt: seller.createdAt,
    updatedAt: seller.updatedAt,
  };
}
