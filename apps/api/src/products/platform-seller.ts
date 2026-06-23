import { PrismaService } from '../prisma/prisma.service';

/** Slug of the seeded Platform Seller — the default owner for platform/admin-created products (M2). */
export const PLATFORM_SELLER_SLUG = 'platform';

/**
 * Resolves the Platform Seller's id. Used as the default product owner for the
 * admin/platform create-path in M2 (sellers supply their own sellerId in slice 2).
 * Throws if the Platform Seller is not seeded.
 */
export async function resolvePlatformSellerId(
  prisma: Pick<PrismaService, 'seller'>,
): Promise<string> {
  const seller = await prisma.seller.findFirstOrThrow({
    where: { slug: PLATFORM_SELLER_SLUG },
    select: { id: true },
  });
  return seller.id;
}
