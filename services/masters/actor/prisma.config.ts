import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { defineConfig, env } from 'prisma/config';

// Single .env for the whole monorepo, at the repo root.
loadEnv({ path: join(__dirname, '../../../.env') });

export default defineConfig({
  schema: '../../../database/schema/schema.prisma',
  migrations: {
    path: '../../../database/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
