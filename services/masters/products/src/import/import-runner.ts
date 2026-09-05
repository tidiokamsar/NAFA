import { createProduct, type UnitInput } from '@nafa/products';
import { SystemClock, UuidGenerator } from '@nafa/shared';
import type { PrismaProductRepository } from '../infrastructure/persistence/prisma/prisma-product.repository';
import type { PrismaProductCodeUniquenessChecker } from '../infrastructure/persistence/prisma/prisma-product-code-uniqueness.checker';
import type { ImportFile } from './import-types';

/** One line of import output — what happened for one product. */
export interface ImportOutcome {
  readonly kind: 'product';
  readonly key: string;
  readonly action: 'created' | 'skipped-existing' | 'failed';
  readonly message?: string;
}

/**
 * Imports a catalogue extract from a validated file.
 *
 * Idempotent on the natural key: a product whose code already exists is
 * skipped and reused — re-running the same file changes nothing.
 *
 * The domain does the validation: every product goes through the factory
 * (VO shapes, unit consistency) then `publish()` (lifecycle). The runner is
 * orchestration only. Invariant 2 (global code uniqueness) is asked of the
 * store before each insert.
 */
export async function runImport(
  file: ImportFile,
  repos: {
    products: PrismaProductRepository;
    uniqueness: PrismaProductCodeUniquenessChecker;
  },
): Promise<readonly ImportOutcome[]> {
  const outcomes: ImportOutcome[] = [];
  const clock = new SystemClock();
  const ids = new UuidGenerator();
  const deps = { clock, ids };

  for (const input of file.products) {
    const existing = await repos.products.findByCode(input.code);
    if (existing) {
      outcomes.push({
        kind: 'product',
        key: input.code,
        action: 'skipped-existing',
        message: `${input.officialName} already in the catalogue.`,
      });
      continue;
    }

    // Invariant 2 — code free globally, asked of the store.
    const unique = await repos.uniqueness.check(input.code as never);
    if (!unique.ok) {
      outcomes.push({
        kind: 'product',
        key: input.code,
        action: 'failed',
        message: unique.error.message,
      });
      continue;
    }

    const created = createProduct({
      code: input.code,
      category: input.category,
      officialName: input.officialName,
      aliases: input.aliases,
      // The wire format spells the kind as a string union; the factory
      // wants the UnitKind enum — same values, structurally narrower.
      units: input.units as UnitInput[],
      clock,
      ids,
    });
    if (!created.ok) {
      outcomes.push({
        kind: 'product',
        key: input.code,
        action: 'failed',
        message: created.error.message,
      });
      continue;
    }

    // Reference data lands PUBLISHED — the catalogue is usable on arrival.
    const published = created.value.publish(deps);
    if (!published.ok) {
      outcomes.push({
        kind: 'product',
        key: input.code,
        action: 'failed',
        message: published.error.message,
      });
      continue;
    }

    await repos.products.save(created.value, 0);
    outcomes.push({
      kind: 'product',
      key: input.code,
      action: 'created',
      message: input.officialName,
    });
  }

  return outcomes;
}
