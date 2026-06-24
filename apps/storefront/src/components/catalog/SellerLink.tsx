import Link from 'next/link';
import type { ProductSeller } from '@/lib/catalog';

interface SellerLinkProps {
  seller?: ProductSeller | null;
}

/**
 * "Sold by <seller>" attribution line for the product detail page.
 *
 * Only the seller name is the link (the meaningful target); "Sold by " is plain
 * text. Renders nothing when the seller (or its slug/displayName) is absent, so
 * a product without a seller projection shows no empty line. Links to the seller
 * storefront page at /seller/[slug].
 */
export function SellerLink({ seller }: SellerLinkProps) {
  if (!seller?.slug || !seller.displayName) return null;

  return (
    <p className="text-sm text-content-muted">
      Sold by{' '}
      <Link
        href={`/seller/${seller.slug}`}
        aria-label={`View products sold by ${seller.displayName}`}
        className="rounded-sm font-medium text-content-muted underline-offset-2 hover:text-primary-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
      >
        {seller.displayName}
      </Link>
    </p>
  );
}
