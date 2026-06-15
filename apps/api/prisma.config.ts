import 'dotenv/config';
import { defineConfig, env } from '@prisma/config';

// Prisma 7 moves connection URLs out of schema.prisma into this config file.
// dotenv loads apps/api/.env (gitignored); Prisma 7 does not auto-load it here.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
    shadowDatabaseUrl: env('SHADOW_DATABASE_URL'),
  },
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
});
