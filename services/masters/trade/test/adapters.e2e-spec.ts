// Requires a live Postgres (see infrastructure/docker/docker-compose.dev.yml).
// Run via `pnpm test:e2e` — never part of the default `pnpm test` (unit) task.
//
// The integration test this Master deserves: the full createOffer path —
// factory asking the REAL PrismaProductCatalog (a product row seeded in the
// test database), a test-double SellerRegistry (no actors table exists;
// invariant 2's adapter is deferred to the Actor Master's persistence),
// then the aggregate through PrismaOfferRepository, lifecycle included.
import { StaleVersionError, SystemClock, UuidGenerator } from '@nafa/shared';
import type { ActorId } from '@nafa/foundation';
import type { ProductId } from '@nafa/products';
import {
  createOffer,
  Offer,
  OfferStatus,
  money,
  type SellerRegistry,
} from '@nafa/trade';
import { PrismaOfferRepository } from '../src/infrastructure/persistence/prisma/prisma-offer.repository';
import { PrismaProductCatalog } from '../src/infrastructure/persistence/prisma/prisma-product-catalog.adapter';
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

const SELLER = '660e8400-e29b-41d4-a716-446655440001' as ActorId;
const PRODUCT_ID = '770e8400-e29b-41d4-a716-446655440002' as ProductId;

/** The deferred adapter's stand-in: the only honest double in the suite. */
const inMemorySellers: SellerRegistry = {
  async isActive() {
    return true;
  },
};

describe('trade adapters (e2e)', () => {
  let prisma: PrismaService;
  let offers: PrismaOfferRepository;
  let catalog: PrismaProductCatalog;
  const clock = new SystemClock();
  const ids = new UuidGenerator();

  beforeAll(async () => {
    prisma = new PrismaService({
      getOrThrow: () => ({ url: E2E_DATABASE_URL }),
    } as never);
    await prisma.$connect();
    offers = new PrismaOfferRepository(prisma, clock, ids);
    catalog = new PrismaProductCatalog(prisma);

    // Seed one PUBLISHED product (fonio, KG + SAC_50) for the catalog reads.
    await prisma.product.create({
      data: {
        id: PRODUCT_ID as string,
        code: 'E2FONIO',
        category: 'CEREAL' as never,
        name: { official: 'Fonio e2e', aliases: [] } as never,
        units: [
          { code: 'KG', name: 'Kilogramme', kind: 'WEIGHT', factorToBase: 1 },
          {
            code: 'SAC_50',
            name: 'Sac de 50 kg',
            kind: 'WEIGHT',
            baseUnit: 'KG',
            factorToBase: 50,
          },
        ] as never,
        status: 'PUBLISHED' as never,
        version: 1,
      },
    });
  });

  afterAll(async () => {
    await prisma.offer.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.$disconnect();
  });

  // ------------------------------------------------------------------
  // ProductCatalog — the cross-Master read
  // ------------------------------------------------------------------

  describe('PrismaProductCatalog', () => {
    it('returns the published product and its declared units', async () => {
      const product = await catalog.getPublishedProduct(PRODUCT_ID);
      expect(product).not.toBeNull();
      expect(product?.productId).toBe(PRODUCT_ID);
      expect([...(product?.units ?? [])]).toEqual(['KG', 'SAC_50']);
    });

    it('returns null for a missing or unpublished product', async () => {
      const missing = '990e8400-e29b-41d4-a716-446655440003' as ProductId;
      expect(await catalog.getPublishedProduct(missing)).toBeNull();

      await prisma.product.create({
        data: {
          id: missing as string,
          code: 'E2DRAFT',
          category: 'CEREAL' as never,
          name: { official: 'Draft e2e', aliases: [] } as never,
          units: [] as never,
          status: 'DRAFT' as never,
          version: 1,
        },
      });
      expect(await catalog.getPublishedProduct(missing)).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // The full path: factory → aggregate → repository → reloaded
  // ------------------------------------------------------------------

  describe('createOffer → PrismaOfferRepository', () => {
    it('creates through the factory against the real catalog, then round-trips', async () => {
      const created = await createOffer(
        {
          sellerId: SELLER,
          productId: PRODUCT_ID,
          quantityValue: 500,
          unitCode: 'KG',
          priceAmountMinor: 12_000,
          currency: 'GNF',
          pickupAreaId: null,
          availableFrom: '2026-10-01',
          availableTo: '2027-01-31',
        },
        { clock, ids },
        { catalog, sellers: inMemorySellers },
      );
      const offer = expectOk(created, 'createOffer');
      await offers.save(offer, 0);

      const loaded = await offers.findById(offer.offerId as unknown as string);
      expect(loaded).not.toBeNull();
      expect(loaded?.status).toBe(OfferStatus.DRAFT);
      expect(loaded?.offeredQuantity.value).toBe(500);
      expect(loaded?.unitPrice.amountMinor).toBe(12_000);
      expect(loaded?.availability.availableTo).toBe('2027-01-31');
      expect(loaded?.expectedVersion).toBe(1);
    });

    it('refuses an undeclared unit through the REAL catalog (invariant 5)', async () => {
      const created = await createOffer(
        {
          sellerId: SELLER,
          productId: PRODUCT_ID,
          quantityValue: 10,
          unitCode: 'L', // fonio declares WEIGHT units only
          priceAmountMinor: 1_000,
          currency: 'GNF',
          pickupAreaId: null,
          availableFrom: '2026-10-01',
        },
        { clock, ids },
        { catalog, sellers: inMemorySellers },
      );
      expect(created.ok).toBe(false);
    });

    it('lives the full lifecycle through the version guard', async () => {
      const created = expectOk(
        await createOffer(
          {
            sellerId: SELLER,
            productId: PRODUCT_ID,
            quantityValue: 2.5,
            unitCode: 'SAC_50',
            priceAmountMinor: 550_000,
            currency: 'GNF',
            pickupAreaId: null,
            availableFrom: '2026-11-01',
          },
          { clock, ids },
          { catalog, sellers: inMemorySellers },
        ),
        'create lifecycle offer',
      );
      await offers.save(created, 0);

      // Load → mutate → save at the loaded version, RELOADING between
      // writes — an in-memory aggregate's expectedVersion stays at its load
      // point, so a second save without a reload replays a stale version.
      const deps = { clock, ids };

      const first = await offers.findById(created.offerId as unknown as string);
      if (!first) return;
      expectOk(first.publish(deps), 'publish');
      expectOk(
        first.revisePrice(expectOk(money(520_000, 'GNF'), 'revise'), deps),
        'revise',
      );
      await offers.save(first, first.expectedVersion);

      const second = await offers.findById(
        created.offerId as unknown as string,
      );
      if (!second) return;
      expectOk(second.close(deps), 'close');
      await offers.save(second, second.expectedVersion);

      // Stale replay now refused.
      await expect(offers.save(second, second.expectedVersion)).rejects.toThrow(
        StaleVersionError,
      );

      const final = await offers.findById(created.offerId as unknown as string);
      expect(final?.status).toBe(OfferStatus.CLOSED);
      expect(final?.unitPrice.amountMinor).toBe(520_000);
    });

    it('findBySeller and findByProduct filter on the indexed columns', async () => {
      const mine = await offers.findBySeller(SELLER as unknown as string);
      expect(mine.length).toBeGreaterThanOrEqual(2);

      const onFonio = await offers.findByProduct(
        PRODUCT_ID as unknown as string,
      );
      expect(onFonio.length).toBeGreaterThanOrEqual(2);
    });

    it('rehydrates an Offer from its stored snapshot', async () => {
      const all = await offers.findBySeller(SELLER as unknown as string);
      const first: Offer = all[0];
      const snapshot = first.snapshot();

      // rehydrate is sync and infallible — the snapshot survives the trip.
      const revived = Offer.rehydrate(snapshot, { clock, ids });
      expect(revived.snapshot()).toEqual(snapshot);
      expect(revived.pullEvents()).toHaveLength(0);
    });
  });
});
