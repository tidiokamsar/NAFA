/**
 * Import CLI — populates the Product catalogue from a JSON file.
 *
 * Usage:
 *   pnpm run import:data -- path/to/catalogue.json
 *
 * Standalone script (same pattern as the geography import CLI and IAM's
 * seed): no NestJS container, PrismaService is built by hand over
 * DATABASE_URL from the repo-root .env, the adapters are wired by hand.
 */
import { config as loadEnv } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SystemClock, UuidGenerator } from '@nafa/shared';
import { PrismaProductCodeUniquenessChecker } from '../infrastructure/persistence/prisma/prisma-product-code-uniqueness.checker';
import { PrismaProductRepository } from '../infrastructure/persistence/prisma/prisma-product.repository';
import { PrismaService } from '../infrastructure/persistence/prisma/prisma.service';
import { parseImportFile } from './import-types';
import { runImport } from './import-runner';

loadEnv({ path: join(__dirname, '../../../../../.env') });

async function main(): Promise<void> {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: pnpm run import:data -- path/to/catalogue.json');
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
  const prisma = new PrismaService({
    getOrThrow: () => ({ url }),
  } as never);
  await prisma.$connect();

  try {
    const clock = new SystemClock();
    const ids = new UuidGenerator();

    const outcomes = await runImport(file, {
      products: new PrismaProductRepository(prisma, clock, ids),
      uniqueness: new PrismaProductCodeUniquenessChecker(prisma),
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
