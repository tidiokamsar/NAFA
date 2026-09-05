// Loaded through Jest's `setupFiles`, so this runs in every worker before the
// test framework starts — before any PrismaService is built.
//
// Why `override: true` is not optional: Nx injects the repo-root `.env` into
// the environment of every task it runs, so DATABASE_URL already points at
// nafa_dev by the time Jest starts. Without the override the suite would
// silently run against the development database and truncate the imported
// Guinea reference data.
//
// Only the keys `.env.test` actually declares are replaced; everything else
// keeps the value inherited from `.env`, so env validation still passes.
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';

loadEnv({
  path: join(__dirname, '../../../../.env.test'),
  override: true,
});

function requireTestDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('.env.test did not provide DATABASE_URL.');
  }

  const name = new URL(url).pathname.slice(1);
  // The suite truncates tables between runs, so it must never be able to
  // point at a database that holds data anyone cares about. A name check is
  // crude, but it fails loudly and early rather than after the first
  // TRUNCATE.
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run the e2e suite against "${name}": the database name ` +
        'must end with "_test". Check .env.test.',
    );
  }

  return url;
}

export const E2E_DATABASE_URL = requireTestDatabaseUrl();
export const E2E_DATABASE_NAME = new URL(E2E_DATABASE_URL).pathname.slice(1);
