import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { backfillSubOrders } from '../src/orders/suborder-backfill';

const adapter = new PrismaPg(process.env.DATABASE_URL as string);
const prisma = new PrismaClient({ adapter });

/**
 * Standalone maintenance script: backfill one Platform-Seller SubOrder (+items)
 * per existing Order. Idempotent — safe to re-run. Aborts (non-zero exit) if
 * the platform seller is missing or a validation assert fails.
 */
async function main(): Promise<void> {
  const result = await backfillSubOrders(prisma);
  console.log(
    `Backfill complete: processed ${result.ordersProcessed} order(s), ` +
      `created ${result.subOrdersCreated} SubOrder(s) + ` +
      `${result.subOrderItemsCreated} SubOrderItem(s). Validation passed.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
