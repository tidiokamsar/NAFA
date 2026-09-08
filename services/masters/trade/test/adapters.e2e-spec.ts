// Requires a live Postgres (see infrastructure/docker/docker-compose.dev.yml).
// Run via `pnpm test:e2e` — never part of the default `pnpm test` (unit) task.
//
// The integration test this Master deserves: the full createOffer path —
// the factory asking the REAL PrismaProductCatalog and, since ACTOR-002, the
// REAL PrismaSellerRegistry over a seeded actors row, then the aggregate
// through PrismaOfferRepository, lifecycle included. No doubles remain: both
// cross-Master questions are answered by the database the services share.
import { StaleVersionError, SystemClock, UuidGenerator } from '@nafa/shared';
import { ActorNature, ActorStatus, type ActorId } from '@nafa/foundation';
import type { ProductId } from '@nafa/products';
import { createOffer, Offer, OfferStatus, money } from '@nafa/trade';
import { PrismaOfferRepository } from '../src/infrastructure/persistence/prisma/prisma-offer.repository';
import { PrismaProductCatalog } from '../src/infrastructure/persistence/prisma/prisma-product-catalog.adapter';
import { PrismaSellerRegistry } from '../src/infrastructure/persistence/prisma/prisma-seller-registry.adapter';
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
/** Registered but never verified — the registry must refuse it. */
const PENDING_SELLER = '660e8400-e29b-41d4-a716-446655440004' as ActorId;
const PRODUCT_ID = '770e8400-e29b-41d4-a716-446655440002' as ProductId;

/** The identity JSON is not what the registry reads; the status column is. */
function actorRow(id: ActorId, status: string, rccmSuffix: string) {
  return {
    id: id as string,
    nature: ActorNature.COMPANY as never,
    identity: {
      nature: 'COMPANY',
      legalName: `Seller ${rccmSuffix}`,
      legalForm: 'SARL',
      rccm: `GN-CKY-2024-B-${rccmSuffix}`,
      nif: `2000000${rccmSuffix.slice(-2)}`,
      incorporationDate: '2019-06-01',
    } as never,
    address: {
      line: 'Quartier Almamya',
      locality: 'Conakry',
      region: 'Conakry',
      countryCode: 'GN',
    } as never,
    contacts: [{ channel: 'PHONE', value: '+224620000000' }] as never,
    roles: [] as never,
    status: status as never,
    rccm: `GN-CKY-2024-B-${rccmSuffix}`,
    nif: `2000000${rccmSuffix.slice(-2)}`,
    phoneNumbers: ['+224620000000'],
    version: 1,
  };
}

describe('trade adapters (e2e)', () => {
  let prisma: PrismaService;
  let offers: PrismaOfferRepository;
  let catalog: PrismaProductCatalog;
  let sellers: PrismaSellerRegistry;
  const clock = new SystemClock();
  const ids = new UuidGenerator();

  beforeAll(async () => {
    prisma = new PrismaService({
      getOrThrow: () => ({ url: E2E_DATABASE_URL }),
    } as never);
    await prisma.$connect();
    offers = new PrismaOfferRepository(prisma, clock, ids);
    catalog = new PrismaProductCatalog(prisma);
    sellers = new PrismaSellerRegistry(prisma);

    // Two actors: one that may sell, one that may not.
    await prisma.actor.create({
      data: actorRow(SELLER, ActorStatus.ACTIVE, '02001'),
    });
    await prisma.actor.create({
      data: actorRow(PENDING_SELLER, ActorStatus.PENDING_VERIFICATION, '02002'),
    });

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
    await prisma.actor.deleteMany({});
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
        { catalog, sellers },
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

    it('refuses a seller the REAL registry does not confirm (invariant 2)', async () => {
      // The reason ACTOR-002 existed. Until the actors table shipped this
      // path could only be exercised against a double that always said yes,
      // so the invariant was declared and never enforced end to end.
      expect(await sellers.isActive(SELLER)).toBe(true);
      expect(await sellers.isActive(PENDING_SELLER)).toBe(false);

      const created = await createOffer(
        {
          sellerId: PENDING_SELLER,
          productId: PRODUCT_ID,
          quantityValue: 100,
          unitCode: 'KG',
          priceAmountMinor: 5_000,
          currency: 'GNF',
          pickupAreaId: null,
          availableFrom: '2026-10-01',
        },
        { clock, ids },
        { catalog, sellers },
      );
      expect(created.ok).toBe(false);
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
        { catalog, sellers },
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
          { catalog, sellers },
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
      const beforeTwoMutations = first.version;
      expectOk(first.publish(deps), 'publish');
      expectOk(
        first.revisePrice(expectOk(money(520_000, 'GNF'), 'revise'), deps),
        'revise',
      );
      // Two mutations before one save. This is where `increment: 1` was
      // wrong: the row moved by one while the aggregate moved by two, and
      // the assertion below is what the suite was missing.
      expect(first.version).toBe(beforeTwoMutations + 2);
      await offers.save(first, first.expectedVersion);

      const afterTwoMutations = await offers.findById(
        created.offerId as unknown as string,
      );
      expect(afterTwoMutations?.expectedVersion).toBe(first.version);

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

  // ------------------------------------------------------------------
  // The outbox — the half of ADR-0008 that had no implementation
  // ------------------------------------------------------------------

  describe('the outbox', () => {
    it('holds one row per event the aggregates emitted, unpublished', async () => {
      const rows = await prisma.outboxEvent.findMany({
        where: { aggregate: { in: ['Offer'] } },
      });

      expect(rows.length).toBeGreaterThan(0);
      // Unpublished is the queue: no relay has run, and one must still see
      // every row here.
      expect(rows.every((r) => r.publishedAt === null)).toBe(true);
      expect(rows.every((r) => r.attempts === 0)).toBe(true);
      // The row id IS the event id the domain generated, so a consumer
      // deduplicates on it without a translation table.
      expect(rows.every((r) => r.id.length === 36)).toBe(true);
      // occurredAt comes from the domain clock, never from the write.
      expect(rows.every((r) => r.occurredAt.includes('T'))).toBe(true);
      expect(rows.some((r) => r.eventType.startsWith('offer.'))).toBe(true);
    });

    it('never holds two rows for one aggregate version', async () => {
      const rows = await prisma.outboxEvent.findMany({
        where: { aggregate: { in: ['Offer'] } },
      });
      const keys = rows.map(
        (r) => `${r.aggregate}#${r.aggregateId}#${r.version}`,
      );

      // Enforced by a unique index rather than trusted: a repository that
      // wrote the same drained buffer twice fails loudly here instead of
      // duplicating the event downstream.
      expect(new Set(keys).size).toBe(keys.length);
    });
  });
});
