import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg(process.env.DATABASE_URL as string);
const prisma = new PrismaClient({ adapter });

/**
 * Recomputes every product's ratingAvg/ratingCount from its VISIBLE reviews
 * (published, not soft-deleted) and overwrites the denormalized columns.
 *
 * Runs outside Nest DI as a standalone maintenance script. Idempotent — safe
 * to re-run, and a safe no-op on an empty Review table (every product's
 * ratingAvg/ratingCount is reset to null/0).
 */
async function main(): Promise<void> {
  const products = await prisma.product.findMany({ select: { id: true } });

  for (const { id } of products) {
    const agg = await prisma.review.aggregate({
      where: { productId: id, publishedAt: { not: null }, deletedAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    });

    await prisma.product.update({
      where: { id },
      data: { ratingAvg: agg._avg.rating, ratingCount: agg._count._all },
    });
  }

  console.log(`Backfilled rating aggregates for ${products.length} products.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
