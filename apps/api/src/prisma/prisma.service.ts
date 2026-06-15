import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Single PrismaClient for the app (one connection pool). Connects on module
 * init and disconnects on shutdown. Inject this everywhere instead of
 * instantiating PrismaClient ad hoc.
 *
 * Prisma 7 requires a driver adapter; we use @prisma/adapter-pg with the
 * DATABASE_URL from the environment.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ adapter: new PrismaPg(process.env.DATABASE_URL as string) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
