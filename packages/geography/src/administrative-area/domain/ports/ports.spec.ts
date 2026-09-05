import {
  type AdministrativeAreaRepository,
  type AreaCodeUniquenessChecker,
  type AreaSuccessionService,
  ADMINISTRATIVE_AREA_REPOSITORY,
  AREA_CODE_UNIQUENESS_CHECKER,
  AREA_SUCCESSION_SERVICE,
} from './index';
import {
  type CountryProfileRepository,
  COUNTRY_PROFILE_REPOSITORY,
} from '../../../country-profile/domain/ports';
import type { AdministrativeArea } from '../administrative-area.aggregate';
import type { CountryProfile } from '../../../country-profile/domain/country-profile.aggregate';
import { administrativeAreaId } from '../administrative-area-id.vo';
import { areaCode } from '../area-code.vo';
import { countryCode } from '../../../country-profile/domain/country-code.vo';
import { AdministrativeLevel } from '../../../country-profile/domain/administrative-level.vo';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unwrapOk<T>(
  result: { ok: true; value: T } | { ok: false; error: unknown },
  label: string,
): T {
  if (result.ok) return result.value;
  throw new Error(`unwrapOk(${label}): expected ok, got error`);
}

const GN = unwrapOk(countryCode('GN'), 'GN');
const LEVEL_2 = AdministrativeLevel.LEVEL_2;
const KIND = unwrapOk(areaCode('KIND'), 'KIND');
const AID = unwrapOk(
  administrativeAreaId('550e8400-e29b-41d4-a716-446655440000'),
  'AID',
);

// ---------------------------------------------------------------------------
// Contract tests for the persistence ports.
//
// These tests do not exercise behaviour — there is no implementation yet.
// They exist for one reason: to prove the contracts are *real*. An interface
// that nothing implements and nothing references is a comment with extra
// steps; a test double that satisfies it is the cheapest proof that the shape
// compiles, and that `save(aggregate, expectedVersion)` is on both
// repositories with the same arity as ACTOR-001.
// ---------------------------------------------------------------------------

describe('CountryProfileRepository contract', () => {
  it('is implemented by a minimal test double', async () => {
    const repo: CountryProfileRepository = {
      async findByCountry() {
        return null;
      },
      async listPublished() {
        return [];
      },
      async save() {
        // test double — no-op
      },
    };

    await expect(repo.save({} as CountryProfile, 0)).resolves.toBeUndefined();
    expect(repo.findByCountry).toBeInstanceOf(Function);
    expect(repo.listPublished).toBeInstanceOf(Function);
  });

  it('declares a Symbol token distinct from the others', () => {
    expect(typeof COUNTRY_PROFILE_REPOSITORY).toBe('symbol');
    expect(COUNTRY_PROFILE_REPOSITORY).not.toBe(ADMINISTRATIVE_AREA_REPOSITORY);
  });
});

describe('AdministrativeAreaRepository contract', () => {
  it('is implemented by a minimal test double', async () => {
    const repo: AdministrativeAreaRepository = {
      async findById() {
        return null;
      },
      async findByCode() {
        return null;
      },
      async findChildren() {
        return [];
      },
      async findAncestors() {
        return [];
      },
      async findByName() {
        return [];
      },
      async save() {
        // test double — no-op
      },
    };

    await expect(
      repo.save({} as AdministrativeArea, 0),
    ).resolves.toBeUndefined();
    expect(repo.findById).toBeInstanceOf(Function);
    expect(repo.findByCode).toBeInstanceOf(Function);
    expect(repo.findChildren).toBeInstanceOf(Function);
    expect(repo.findAncestors).toBeInstanceOf(Function);
    expect(repo.findByName).toBeInstanceOf(Function);
  });

  it('declares a Symbol token', () => {
    expect(typeof ADMINISTRATIVE_AREA_REPOSITORY).toBe('symbol');
  });
});

describe('save signature parity with ACTOR-001', () => {
  // The criterion: save(aggregate, expectedVersion) on both ports, identical
  // arity. We assert this structurally: both repos accept an aggregate and a
  // number, in that order, and return Promise<void>. If the signature drifted,
  // the assignment below would not compile.
  it('CountryProfileRepository.save takes (profile, version)', () => {
    const save: Pick<
      CountryProfileRepository,
      'save'
    >['save'] = async (): Promise<void> => {};

    const fn: (a: CountryProfile, v: number) => Promise<void> = save;
    expect(fn).toBe(save);
  });

  it('AdministrativeAreaRepository.save takes (area, version)', () => {
    const save: Pick<
      AdministrativeAreaRepository,
      'save'
    >['save'] = async (): Promise<void> => {};

    const fn: (a: AdministrativeArea, v: number) => Promise<void> = save;
    expect(fn).toBe(save);
  });
});

describe('AreaCodeUniquenessChecker contract', () => {
  it('is implemented by a minimal test double', async () => {
    const checker: AreaCodeUniquenessChecker = {
      async check() {
        return { ok: true as const, value: undefined };
      },
    };

    const result = await checker.check(GN, LEVEL_2, KIND);
    expect(result.ok).toBe(true);
  });

  it('accepts an optional excluding id', async () => {
    const checker: AreaCodeUniquenessChecker = {
      async check(_cc, _lvl, _code, excluding) {
        // The excluding parameter is part of the contract — exercising it
        // proves the arity compiles.
        expect(excluding).toBe(AID);
        return { ok: true as const, value: undefined };
      },
    };

    const result = await checker.check(GN, LEVEL_2, KIND, AID);
    expect(result.ok).toBe(true);
  });

  it('declares a Symbol token', () => {
    expect(typeof AREA_CODE_UNIQUENESS_CHECKER).toBe('symbol');
  });
});

describe('AreaSuccessionService contract', () => {
  it('is implemented by a minimal test double', async () => {
    const service: AreaSuccessionService = {
      async merge() {
        return {
          ok: true as const,
          value: [] as readonly AdministrativeArea[],
        };
      },
      async split() {
        return { ok: true as const, value: {} as AdministrativeArea };
      },
    };

    const merged = await service.merge([], []);
    expect(merged.ok).toBe(true);

    const split = await service.split({} as AdministrativeArea, []);
    expect(split.ok).toBe(true);
  });

  it('declares a Symbol token', () => {
    expect(typeof AREA_SUCCESSION_SERVICE).toBe('symbol');
  });
});
