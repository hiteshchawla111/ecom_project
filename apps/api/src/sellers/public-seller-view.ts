/**
 * public-seller-view.ts
 *
 * Pure projection: converts a Seller DB record into the PUBLIC seller view.
 *
 * Security contract: the public view exposes ONLY the shop's presentational
 * fields. It MUST NOT carry status, KYC fields/flags, timestamps, or bank info
 * — those belong to the admin/owner view (`toSellerView` in seller-mask.ts).
 */

import { Seller } from '@prisma/client';

/** The only fields exposed on the public, unauthenticated seller surface. */
export interface PublicSellerView {
  id: string;
  displayName: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
}

/** Input — only the fields this projection reads. */
type PublicSellerInput = Pick<
  Seller,
  'id' | 'displayName' | 'slug' | 'description' | 'logoUrl'
>;

/** Maps a Seller record to its public view (5 fields, nothing else). */
export function toPublicSellerView(
  seller: PublicSellerInput,
): PublicSellerView {
  return {
    id: seller.id,
    displayName: seller.displayName,
    slug: seller.slug,
    description: seller.description,
    logoUrl: seller.logoUrl,
  };
}
