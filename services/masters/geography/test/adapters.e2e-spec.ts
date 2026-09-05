// Requires a live Postgres (see infrastructure/docker/docker-compose.dev.yml).
// Run via `pnpm test:e2e` — never part of the default `pnpm test` (unit) task,
// which must stay runnable without any external infra.
//
// Adapter-level e2e: PrismaService is wired by hand against the test
// database (same pattern as the import CLI — no Nest container, no Redis)
// and the four geography adapters are exercised through their ports. The
// domain factories build the aggregates, so every write crosses the full
// snapshot → row → database → row → snapshot path.
import { StaleVersionError, SystemClock, UuidGenerator } from '@nafa/shared';
import {
  AdministrativeLevel,
  createAdministrativeArea,
  createCountryProfile,
  GeographyRule,
  type AdministrativeArea,
  type CountryProfile,
} from '@nafa/geography';
import { PrismaAdministrativeAreaRepository } from '../src/infrastructure/persistence/prisma/prisma-administrative-area.repository';
import { PrismaAreaCodeUniquenessChecker } from '../src/infrastructure/persistence/prisma/prisma-area-code-uniqueness.checker';
import { PrismaAreaSuccessionService } from '../src/infrastructure/persistence/prisma/prisma-area-succession.service';
import { PrismaCountryProfileRepository } from '../src/infrastructure/persistence/prisma/prisma-country-profile.repository';
import { PrismaService } from '../src/infrastructure/persistence/prisma/prisma.service';
import { E2E_DATABASE_URL } from './e2e-env';

/** Unwraps a Result the test expects to have succeeded. */
function expectOk<T>(
  result: { ok: boolean; value?: T; error?: { rule: string; message: string } },
  label: string,
): T {
  if (!result.ok) {
    throw new Error(`expectOk(${label}): ${result.error?.message}`);
  }
  return result.value as T;
}

const LEVELS = [
  { level: AdministrativeLevel.LEVEL_1, singular: 'Région', plural: 'Régions' },
  {
    level: AdministrativeLevel.LEVEL_2,
    singular: 'Préfecture',
    plural: 'Préfectures',
  },
];

/** Builds a PUBLISHED profile aggregate for a fresh country code. */
function publishedProfile(code: string): CountryProfile {
  const profile = expectOk(
    createCountryProfile({
      countryCode: code,
      levels: LEVELS,
      clock: new SystemClock(),
      ids: new UuidGenerator(),
    }),
    `profile ${code}`,
  );
  expectOk(profile.publish(), `publish ${code}`);
  return profile;
}

describe('geography adapters (e2e)', () => {
  let prisma: PrismaService;
  let profiles: PrismaCountryProfileRepository;
  let areas: PrismaAdministrativeAreaRepository;
  let uniqueness: PrismaAreaCodeUniquenessChecker;
  let succession: PrismaAreaSuccessionService;
  const clock = new SystemClock();

  beforeAll(async () => {
    prisma = new PrismaService({
      getOrThrow: () => ({ url: E2E_DATABASE_URL }),
    } as never);
    await prisma.$connect();

    const ids = new UuidGenerator();
    profiles = new PrismaCountryProfileRepository(prisma, clock, ids);
    areas = new PrismaAdministrativeAreaRepository(prisma, clock, ids);
    uniqueness = new PrismaAreaCodeUniquenessChecker(prisma);
    succession = new PrismaAreaSuccessionService();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ------------------------------------------------------------------
  // CountryProfileRepository
  // ------------------------------------------------------------------

  describe('PrismaCountryProfileRepository', () => {
    it('inserts with expectedVersion 0 and reads back a rehydrated aggregate', async () => {
      const profile = publishedProfile('GA');
      await profiles.save(profile, 0);

      const loaded = await profiles.findByCountry('GA');
      expect(loaded).not.toBeNull();
      expect(loaded?.status).toBe('PUBLISHED');
      expect(loaded?.levels.map((l) => l.level)).toEqual([
        AdministrativeLevel.LEVEL_1,
        AdministrativeLevel.LEVEL_2,
      ]);
      expect(loaded?.levels[0].label.singular).toBe('Région');
      // Rehydrated at the stored version — save must expect exactly that.
      expect(loaded?.expectedVersion).toBe(1);
    });

    it('updates through the version guard, then refuses a stale write', async () => {
      const profile = publishedProfile('GB');
      await profiles.save(profile, 0);

      const loaded = await profiles.findByCountry('GB');
      expect(loaded).not.toBeNull();
      if (!loaded) return;

      expectOk(loaded.deprecate(), 'deprecate GB');
      // First write at the loaded version succeeds (1 → 2).
      await profiles.save(loaded, loaded.expectedVersion);

      // Replaying the same stale version must refuse.
      await expect(
        profiles.save(loaded, loaded.expectedVersion),
      ).rejects.toThrow(StaleVersionError);
    });

    it('listPublished returns only PUBLISHED profiles', async () => {
      const published = publishedProfile('GC');
      await profiles.save(published, 0);

      const draft = expectOk(
        createCountryProfile({
          countryCode: 'GD',
          levels: LEVELS,
          clock,
          ids: new UuidGenerator(),
        }),
        'draft GD',
      ); // deliberately not published
      await profiles.save(draft, 0);

      const list = await profiles.listPublished();
      const codes = list.map((p) => p.snapshot().countryCode);
      expect(codes).toContain('GC');
      expect(codes).not.toContain('GD');
    });
  });

  // ------------------------------------------------------------------
  // AdministrativeAreaRepository
  // ------------------------------------------------------------------

  describe('PrismaAdministrativeAreaRepository', () => {
    let root: AdministrativeArea;
    let region: AdministrativeArea;
    let prefecture: AdministrativeArea;

    beforeAll(async () => {
      const profile = publishedProfile('GE');
      await profiles.save(profile, 0);
      const ids = new UuidGenerator();

      root = expectOk(
        createAdministrativeArea({
          area: {
            areaId: ids.generate(),
            level: AdministrativeLevel.COUNTRY,
            code: 'GE',
            officialName: 'Testland',
            aliases: [],
            parentId: null,
            latitude: null,
            longitude: null,
            startDate: '2026-01-01',
            endDate: null,
          },
          profile,
          parentInfo: null,
          clock,
          ids,
        }),
        'root',
      );
      await areas.save(root, 0);

      region = expectOk(
        createAdministrativeArea({
          area: {
            areaId: ids.generate(),
            level: AdministrativeLevel.LEVEL_1,
            code: 'GE-R1',
            officialName: 'Kindia',
            aliases: ['Kindya'],
            parentId: root.areaId,
            latitude: 10.06,
            longitude: -12.86,
            startDate: '2026-01-01',
            endDate: null,
          },
          profile,
          parentInfo: { parentId: root.areaId, parentLevel: root.level },
          clock,
          ids,
        }),
        'region',
      );
      await areas.save(region, 0);

      prefecture = expectOk(
        createAdministrativeArea({
          area: {
            areaId: ids.generate(),
            level: AdministrativeLevel.LEVEL_2,
            code: 'GE-P1',
            officialName: 'Kindia préfecture',
            aliases: [],
            parentId: region.areaId,
            latitude: null,
            longitude: null,
            startDate: '2026-01-01',
            endDate: null,
          },
          profile,
          parentInfo: { parentId: region.areaId, parentLevel: region.level },
          clock,
          ids,
        }),
        'prefecture',
      );
      await areas.save(prefecture, 0);
    });

    it('findById round-trips JSON value objects intact', async () => {
      const loaded = await areas.findById(region.areaId as unknown as string);
      expect(loaded).not.toBeNull();
      expect(loaded?.name.official).toBe('Kindia');
      expect([...(loaded?.name.aliases ?? [])]).toEqual(['Kindya']);
      expect(loaded?.centroid).toEqual({ latitude: 10.06, longitude: -12.86 });
      expect(loaded?.validity.startDate).toBe('2026-01-01');
      expect(loaded?.validity.endDate).toBeNull();
    });

    it('findByCode locates an area by its natural key', async () => {
      const loaded = await areas.findByCode('GE', 'GE-R1');
      expect(loaded?.areaId).toBe(region.areaId);
    });

    it('findChildren returns the direct children only', async () => {
      const children = await areas.findChildren(
        region.areaId as unknown as string,
      );
      expect(children.map((c) => c.code)).toEqual(['GE-P1']);
    });

    it('findAncestors walks the chain bottom-up, excluding the start', async () => {
      const ancestors = await areas.findAncestors(
        prefecture.areaId as unknown as string,
      );
      expect(ancestors.map((a) => a.code)).toEqual(['GE-R1', 'GE']);
    });

    it('findByName matches official names and aliases', async () => {
      const byOfficial = await areas.findByName('GE', 'Kindia');
      expect(byOfficial.map((a) => a.code)).toContain('GE-R1');

      const byAlias = await areas.findByName('GE', 'Kindya');
      expect(byAlias.map((a) => a.code)).toContain('GE-R1');
    });

    it('save refuses a stale write with StaleVersionError', async () => {
      const loaded = await areas.findById(region.areaId as unknown as string);
      expect(loaded).not.toBeNull();
      if (!loaded) return;

      expectOk(
        loaded.rename({ official: 'Kindia renommée', aliases: [] }),
        'rename',
      );
      // First write with the correct expected version succeeds.
      await areas.save(loaded, loaded.expectedVersion);

      // A second write replaying the same stale version must refuse.
      await expect(areas.save(loaded, loaded.expectedVersion)).rejects.toThrow(
        StaleVersionError,
      );
    });
  });

  // ------------------------------------------------------------------
  // AreaCodeUniquenessChecker
  // ------------------------------------------------------------------

  describe('PrismaAreaCodeUniquenessChecker', () => {
    it('accepts a free code, refuses a taken one, excludes self', async () => {
      const profile = publishedProfile('GF');
      await profiles.save(profile, 0);
      const ids = new UuidGenerator();

      const area = expectOk(
        createAdministrativeArea({
          area: {
            areaId: ids.generate(),
            level: AdministrativeLevel.COUNTRY,
            code: 'GF',
            officialName: 'Testland F',
            aliases: [],
            parentId: null,
            latitude: null,
            longitude: null,
            startDate: '2026-01-01',
            endDate: null,
          },
          profile,
          parentInfo: null,
          clock,
          ids,
        }),
        'GF root',
      );
      await areas.save(area, 0);

      // A new LEVEL_1 code is free.
      const free = await uniqueness.check('GF', 'LEVEL_1', 'GF-X1');
      expect(free.ok).toBe(true);

      // The root's own code is taken at COUNTRY level.
      const taken = await uniqueness.check('GF', 'COUNTRY', 'GF');
      expect(taken.ok).toBe(false);
      if (!taken.ok) {
        expect(taken.error.rule).toBe(GeographyRule.AREA_CODE_NOT_UNIQUE);
      }

      // …unless the holder itself is asking (an update).
      const excludingSelf = await uniqueness.check(
        'GF',
        'COUNTRY',
        'GF',
        area.areaId as never,
      );
      expect(excludingSelf.ok).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // AreaSuccessionService
  // ------------------------------------------------------------------

  describe('PrismaAreaSuccessionService', () => {
    it('merge marks every source MERGED with the successors recorded', async () => {
      const profile = publishedProfile('GG');
      await profiles.save(profile, 0);
      const ids = new UuidGenerator();

      // A root to parent the LEVEL_1s from.
      const root = expectOk(
        createAdministrativeArea({
          area: {
            areaId: ids.generate(),
            level: AdministrativeLevel.COUNTRY,
            code: 'GG',
            officialName: 'Testland G',
            aliases: [],
            parentId: null,
            latitude: null,
            longitude: null,
            startDate: '2026-01-01',
            endDate: null,
          },
          profile,
          parentInfo: null,
          clock,
          ids,
        }),
        'GG root',
      );
      await areas.save(root, 0);

      const parentInfo = {
        parentId: root.areaId as never,
        parentLevel: root.level,
      };
      const s1 = expectOk(
        createAdministrativeArea({
          area: {
            areaId: ids.generate(),
            level: AdministrativeLevel.LEVEL_1,
            code: 'GG-A',
            officialName: 'A',
            aliases: [],
            parentId: root.areaId,
            latitude: null,
            longitude: null,
            startDate: '2026-01-01',
            endDate: null,
          },
          profile,
          parentInfo,
          clock,
          ids,
        }),
        'GG-A',
      );
      const s2 = expectOk(
        createAdministrativeArea({
          area: {
            areaId: ids.generate(),
            level: AdministrativeLevel.LEVEL_1,
            code: 'GG-B',
            officialName: 'B',
            aliases: [],
            parentId: root.areaId,
            latitude: null,
            longitude: null,
            startDate: '2026-01-01',
            endDate: null,
          },
          profile,
          parentInfo,
          clock,
          ids,
        }),
        'GG-B',
      );
      await areas.save(s1, 0);
      await areas.save(s2, 0);

      // The honest application-layer flow: load from the store, then
      // mutate, then save at the loaded version. An in-memory aggregate
      // keeps expectedVersion 0 after its insert — saving it again would
      // re-insert.
      const s1Loaded = await areas.findByCode('GG', 'GG-A');
      const s2Loaded = await areas.findByCode('GG', 'GG-B');
      expect(s1Loaded).not.toBeNull();
      expect(s2Loaded).not.toBeNull();
      if (!s1Loaded || !s2Loaded) return;

      const merged = await succession.merge(
        [s1Loaded, s2Loaded],
        [root.areaId as never],
      );
      expect(merged.ok).toBe(true);
      if (!merged.ok) return;

      for (const source of merged.value) {
        expect(source.status).toBe('MERGED');
        await areas.save(source, source.expectedVersion);
      }

      const reloaded = await areas.findByCode('GG', 'GG-A');
      expect(reloaded?.status).toBe('MERGED');
      expect([...(reloaded?.successors ?? [])]).toEqual([
        root.areaId as unknown as string,
      ]);
    });

    it('split demands two successors and then records them', async () => {
      const profile = publishedProfile('GH');
      await profiles.save(profile, 0);
      const ids = new UuidGenerator();

      const root = expectOk(
        createAdministrativeArea({
          area: {
            areaId: ids.generate(),
            level: AdministrativeLevel.COUNTRY,
            code: 'GH',
            officialName: 'Testland H',
            aliases: [],
            parentId: null,
            latitude: null,
            longitude: null,
            startDate: '2026-01-01',
            endDate: null,
          },
          profile,
          parentInfo: null,
          clock,
          ids,
        }),
        'GH root',
      );
      await areas.save(root, 0);

      // Load from the store before mutating — same honest flow as merge.
      const loadedRoot = await areas.findByCode('GH', 'GH');
      expect(loadedRoot).not.toBeNull();
      if (!loadedRoot) return;

      const one = await succession.split(loadedRoot, [ids.generate() as never]);
      expect(one.ok).toBe(false);

      const two = await succession.split(loadedRoot, [
        ids.generate() as never,
        ids.generate() as never,
      ]);
      expect(two.ok).toBe(true);
      if (!two.ok) return;
      expect(two.value.status).toBe('SPLIT');
      expect(two.value.successors).toHaveLength(2);

      await areas.save(two.value, two.value.expectedVersion);
      const reloaded = await areas.findByCode('GH', 'GH');
      expect(reloaded?.status).toBe('SPLIT');
    });
  });
});
