// Requires a live Postgres (see infrastructure/docker/docker-compose.dev.yml).
// Run via `pnpm test:e2e` — never part of the default `pnpm test` (unit) task.
//
// Adapter-level e2e, the geography-suite pattern: PrismaService wired by
// hand against the test database, adapters exercised through their ports,
// aggregates built by the domain factory — every write crosses the full
// snapshot → row → database → row → snapshot path.
import { StaleVersionError, SystemClock, UuidGenerator } from '@nafa/shared';
import {
  createProduct,
  productName,
  ProductRule,
  ProductStatus,
  type Product,
  type UnitInput,
} from '@nafa/products';
import { PrismaProductCodeUniquenessChecker } from '../src/infrastructure/persistence/prisma/prisma-product-code-uniqueness.checker';
import { PrismaProductRepository } from '../src/infrastructure/persistence/prisma/prisma-product.repository';
import { PrismaService } from '../src/infrastructure/persistence/prisma/prisma.service';
import { E2E_DATABASE_URL } from './e2e-env';

/** Unwraps a Result the test expects to have succeeded. */
function expectOk<T>(
  result: { ok: boolean; value?: T; error?: { message: string } },
  label: string,
): T {
  if (!result.ok) {
    throw new Error(`expectOk(${label}): ${result.error?.message}`);
  }
  return result.value as T;
}

const UNITS = [
  { code: 'KG', name: 'Kilogramme', kind: 'WEIGHT' as const, factorToBase: 1 },
  {
    code: 'SAC_50',
    name: 'Sac de 50 kg',
    kind: 'WEIGHT' as const,
    baseUnit: 'KG',
    factorToBase: 50,
  },
];

/** A freshly created-and-published product from the factory. */
function newProduct(code: string, official: string): Product {
  const product = expectOk(
    createProduct({
      code,
      category: 'CEREAL',
      officialName: official,
      aliases: [official.toLowerCase()],
      units: UNITS as UnitInput[],
      clock: new SystemClock(),
      ids: new UuidGenerator(),
    }),
    code,
  );
  expectOk(
    product.publish({ clock: new SystemClock(), ids: new UuidGenerator() }),
    `publish ${code}`,
  );
  return product;
}

describe('products adapters (e2e)', () => {
  let prisma: PrismaService;
  let products: PrismaProductRepository;
  let uniqueness: PrismaProductCodeUniquenessChecker;
  const clock = new SystemClock();
  const ids = new UuidGenerator();
  const deps = { clock, ids };

  beforeAll(async () => {
    prisma = new PrismaService({
      getOrThrow: () => ({ url: E2E_DATABASE_URL }),
    } as never);
    await prisma.$connect();
    products = new PrismaProductRepository(prisma, clock, ids);
    uniqueness = new PrismaProductCodeUniquenessChecker(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('PrismaProductRepository', () => {
    it('inserts at expectedVersion 0 and reads back a rehydrated aggregate', async () => {
      await products.save(newProduct('E2A', 'Fonio e2e'), 0);

      const loaded = await products.findByCode('E2A');
      expect(loaded).not.toBeNull();
      expect(loaded?.status).toBe(ProductStatus.PUBLISHED);
      expect(loaded?.name.official).toBe('Fonio e2e');
      expect(loaded?.units).toHaveLength(2);
      expect(loaded?.units[1].factorToBase).toBe(50);
      expect(loaded?.expectedVersion).toBe(1);
    });

    it('findByName matches official names and aliases, case-insensitively', async () => {
      const byOfficial = await products.findByName('fonio e2e');
      expect(byOfficial.map((p) => p.code)).toContain('E2A');

      const byAlias = await products.findByName('fonio e2e');
      expect(byAlias.map((p) => p.code)).toContain('E2A');
    });

    it('findByCategory filters', async () => {
      const cereals = await products.findByCategory('CEREAL');
      expect(cereals.map((p) => p.code)).toContain('E2A');
      const cashCrops = await products.findByCategory('CASH_CROP');
      expect(cashCrops.map((p) => p.code)).not.toContain('E2A');
    });

    it('renames through the version guard, then refuses the stale write', async () => {
      await products.save(newProduct('E2B', 'Maïs e2e'), 0);

      const loaded = await products.findByCode('E2B');
      expect(loaded).not.toBeNull();
      if (!loaded) return;

      expectOk(
        loaded.rename({ official: 'Maïs e2e renommé', aliases: [] }, deps),
        'rename E2B',
      );
      await products.save(loaded, loaded.expectedVersion);

      await expect(
        products.save(loaded, loaded.expectedVersion),
      ).rejects.toThrow(StaleVersionError);
    });

    it('stores the version the aggregate reached, not the number of saves', async () => {
      // The regression this ticket exists for. Renaming and deprecating
      // before a single save moves the aggregate by two events, while
      // `version: { increment: 1 }` moved the row by one — so the next load
      // handed a use case a version the domain never produced.
      const product = newProduct('E2VER', 'Sorgho e2e');
      await products.save(product, 0);

      const loaded = await products.findByCode('E2VER');
      if (!loaded) throw new Error('E2VER not found');
      const before = loaded.version;

      const renamed = expectOk(
        productName({ official: 'Sorgho révisé', aliases: ['sorgho e2e'] }),
        'productName',
      );
      expectOk(loaded.rename(renamed, deps), 'rename');
      expectOk(loaded.deprecate(deps), 'deprecate');
      expect(loaded.version).toBe(before + 2);

      await products.save(loaded, loaded.expectedVersion);

      const reloaded = await products.findByCode('E2VER');
      // The property, stated without a magic number: what the row holds is
      // what the aggregate counted, whatever the registration path emitted.
      expect(reloaded?.expectedVersion).toBe(loaded.version);
      expect(reloaded?.status).toBe(ProductStatus.DEPRECATED);
    });

    it('deprecates and freezes — the lifecycle lands in the database', async () => {
      await products.save(newProduct('E2C', 'Riz e2e'), 0);
      const loaded = await products.findByCode('E2C');
      if (!loaded) return;

      expectOk(loaded.deprecate(deps), 'deprecate E2C');
      await products.save(loaded, loaded.expectedVersion);

      const reloaded = await products.findByCode('E2C');
      expect(reloaded?.status).toBe(ProductStatus.DEPRECATED);
    });
  });

  describe('PrismaProductCodeUniquenessChecker', () => {
    it('accepts a free code, refuses a taken one, excludes self', async () => {
      await products.save(newProduct('E2D', 'Anacarde e2e'), 0);
      const holder = await products.findByCode('E2D');
      expect(holder).not.toBeNull();

      const free = await uniqueness.check('E2F' as never);
      expect(free.ok).toBe(true);

      const taken = await uniqueness.check('E2D' as never);
      expect(taken.ok).toBe(false);
      if (!taken.ok) {
        expect(taken.error.rule).toBe(ProductRule.PRODUCT_CODE_NOT_UNIQUE);
      }

      const excludingSelf = await uniqueness.check(
        'E2D' as never,
        holder?.productId as never,
      );
      expect(excludingSelf.ok).toBe(true);
    });
  });
});
