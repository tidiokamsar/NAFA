/**
 * Import CLI — populates the Geography Master from a JSON file.
 *
 * Usage:
 *   pnpm run import:data -- path/to/country.json
 *
 * Standalone script (same pattern as IAM's seed): no NestJS container, the
 * Prisma client is built directly with the driver adapter over
 * DATABASE_URL from the repo-root .env. The domain adapters are reused
 * as-is — the CLI wires them by hand instead of through InfrastructureModule.
 */
import { config as loadEnv } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SystemClock, UuidGenerator } from '@nafa/shared';
import { PrismaAdministrativeAreaRepository } from '../infrastructure/persistence/prisma/prisma-administrative-area.repository';
import { PrismaAreaCodeUniquenessChecker } from '../infrastructure/persistence/prisma/prisma-area-code-uniqueness.checker';
import { PrismaCountryProfileRepository } from '../infrastructure/persistence/prisma/prisma-country-profile.repository';
import { PrismaService } from '../infrastructure/persistence/prisma/prisma.service';
import { parseImportFile } from './import-types';
import { runImport } from './import-runner';

loadEnv({ path: join(__dirname, '../../../../.env') });

async function main(): Promise<void> {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: pnpm run import:data -- path/to/country.json');
    process.exitCode = 1;
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set — check the repo-root .env.');
    process.exitCode = 1;
    return;
  }

  const raw = JSON.parse(await readFile(target, 'utf8'));
  const file = parseImportFile(raw);

  // PrismaService's constructor only reads config.getOrThrow('database');
  // a minimal stand-in keeps the CLI container-free.
  const fakeConfig = {
    getOrThrow: () => ({ url }),
  } as never;
  const prisma = new PrismaService(fakeConfig);
  await prisma.$connect();

  try {
    const clock = new SystemClock();
    const ids = new UuidGenerator();

    const outcomes = await runImport(file, {
      profiles: new PrismaCountryProfileRepository(prisma, clock, ids),
      areas: new PrismaAdministrativeAreaRepository(prisma, clock, ids),
      uniqueness: new PrismaAreaCodeUniquenessChecker(prisma),
    });

    for (const o of outcomes) {
      const tag =
        o.action === 'created'
          ? '+'
          : o.action === 'skipped-existing'
            ? '='
            : '!';
      console.log(
        `${tag} [${o.kind}] ${o.key}: ${o.action}${o.message ? ` — ${o.message}` : ''}`,
      );
    }

    const failed = outcomes.filter((o) => o.action === 'failed').length;
    const created = outcomes.filter((o) => o.action === 'created').length;
    console.log(
      `\nDone: ${created} created, ${outcomes.length - created - failed} skipped, ${failed} failed.`,
    );
    if (failed > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error('Import failed:', error);
  process.exitCode = 1;
});
