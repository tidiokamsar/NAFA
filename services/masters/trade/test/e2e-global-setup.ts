// Runs once, before any e2e worker starts. Makes the suite reproducible from
// a bare Postgres: create the test database if it is missing, put the schema
// in sync, and start from empty products table.
//
// Nothing here touches nafa_dev — e2e-env.ts refuses any database whose name
// does not end in "_test", and this file only ever connects to that database
// (plus the `postgres` maintenance database, to issue CREATE DATABASE).
// nafa_test is # shared with IAM and geography e2e suites; disjoint
// tables, and this truncate list names only the geography ones.
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { Client } from 'pg';
import { E2E_DATABASE_NAME, E2E_DATABASE_URL } from './e2e-env';

const SERVICE_ROOT = join(__dirname, '..');

async function createDatabaseIfMissing(): Promise<void> {
  // CREATE DATABASE cannot run inside the target database, so connect to the
  // maintenance one with the same credentials.
  const maintenanceUrl = new URL(E2E_DATABASE_URL);
  maintenanceUrl.pathname = '/postgres';

  const client = new Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [E2E_DATABASE_NAME],
    );
    if (rowCount === 0) {
      // An identifier cannot be parameterised. The name is not user input: it
      // comes from a committed file and has already been checked to end in
      // "_test".
      await client.query(`CREATE DATABASE "${E2E_DATABASE_NAME}"`);
      console.log(`[e2e] created database ${E2E_DATABASE_NAME}`);
    }
  } finally {
    await client.end();
  }
}

function pushSchema(): void {
  // prisma.config.ts reads the root `.env`, but dotenvx does not overwrite
  // variables that are already set, so the DATABASE_URL handed to the child
  // process is the one Prisma ends up using.
  execSync('pnpm exec prisma db push', {
    cwd: SERVICE_ROOT,
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'inherit',
  });
}

async function truncateTestData(): Promise<void> {
  // Cleaning up front rather than in teardown: a failed run leaves its rows
  // behind for inspection, and the next run still starts from a known state.
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    // actors too: since ACTOR-002 this suite seeds two of them for the real
    // SellerRegistry, and a run that dies before afterAll would leave rows
    // whose unique RCCM blocks the next one.
    await client.query('TRUNCATE TABLE offers, actors CASCADE');
  } finally {
    await client.end();
  }
}

export default async function globalSetup(): Promise<void> {
  await createDatabaseIfMissing();
  pushSchema();
  await truncateTestData();
}
