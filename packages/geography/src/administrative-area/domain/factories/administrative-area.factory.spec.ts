import { FixedClock, SequentialIdGenerator } from '@nafa/shared';
import { AdministrativeLevel } from '../../../country-profile/domain/administrative-level.vo';
import { levelDefinition } from '../../../country-profile/domain/level-definition.vo';
import { countryCode } from '../../../country-profile/domain/country-code.vo';
import {
  CountryProfile,
  type RegisterCountryProfileInput,
} from '../../../country-profile/domain/country-profile.aggregate';
import { GeographyRule } from '../../../country-profile/domain/country-profile.errors';
import { administrativeAreaId } from '../administrative-area-id.vo';
import { createAdministrativeArea } from './administrative-area.factory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clock = new FixedClock(new Date('2026-01-15T10:00:00Z'));
const ids = new SequentialIdGenerator();

function expectOk<T, E>(
  result: { readonly ok: boolean; readonly value?: T; readonly error?: E },
  msg: string,
): T {
  if (result.ok) return result.value!;
  throw new Error(`${msg}: ${result.error}`);
}

function publishedGuineaProfile(): CountryProfile {
  const code = expectOk(countryCode('GN'), 'countryCode GN');
  const levels = [
    expectOk(
      levelDefinition({
        level: AdministrativeLevel.LEVEL_1,
        label: { singular: 'Région', plural: 'Régions' },
      }),
      'level 1',
    ),
    expectOk(
      levelDefinition({
        level: AdministrativeLevel.LEVEL_2,
        label: { singular: 'Préfecture', plural: 'Préfectures' },
      }),
      'level 2',
    ),
    expectOk(
      levelDefinition({
        level: AdministrativeLevel.LEVEL_3,
        label: { singular: 'Sous-préfecture', plural: 'Sous-préfectures' },
      }),
      'level 3',
    ),
    expectOk(
      levelDefinition({
        level: AdministrativeLevel.LEVEL_4,
        label: { singular: 'District', plural: 'Districts' },
      }),
      'level 4',
    ),
  ];
  const input: RegisterCountryProfileInput = { countryCode: code, levels };
  const profile = expectOk(
    CountryProfile.register(input, { clock, ids }),
    'register',
  );
  expectOk(profile.publish(), 'publish');
  return profile;
}

function draftGuineaProfile(): CountryProfile {
  const code = expectOk(countryCode('GN'), 'countryCode GN');
  const levels = [
    expectOk(
      levelDefinition({
        level: AdministrativeLevel.LEVEL_1,
        label: { singular: 'Région', plural: 'Régions' },
      }),
      'level 1',
    ),
  ];
  const input: RegisterCountryProfileInput = { countryCode: code, levels };
  return expectOk(CountryProfile.register(input, { clock, ids }), 'register');
}

const PARENT_ID = 'f1e2d3c4-b5a6-4f7e-8d9c-0b1a2f3e4d5c';

describe('createAdministrativeArea', () => {
  const profile = publishedGuineaProfile();

  it('creates a LEVEL_1 area (Région) with a COUNTRY parent', () => {
    const result = createAdministrativeArea({
      area: {
        areaId: '550e8400-e29b-41d4-a716-446655440000',
        level: AdministrativeLevel.LEVEL_1,
        code: 'GN-FN',
        officialName: 'Faranah',
        aliases: ['Faranah Region'],
        parentId: PARENT_ID,
        latitude: 10.2,
        longitude: -10.8,
        startDate: '2026-01-01',
      },
      profile,
      parentInfo: {
        parentId: expectOk(administrativeAreaId(PARENT_ID), 'parentId'),
        parentLevel: AdministrativeLevel.COUNTRY,
      },
      clock,
      ids,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('ACTIVE');
    expect(result.value.level).toBe(AdministrativeLevel.LEVEL_1);
    expect(result.value.name.official).toBe('Faranah');
  });

  it('creates an area without centroid', () => {
    const result = createAdministrativeArea({
      area: {
        areaId: '550e8400-e29b-41d4-a716-446655440001',
        level: AdministrativeLevel.LEVEL_2,
        code: 'KIND',
        officialName: 'Kindia',
        parentId: PARENT_ID,
        latitude: null,
        longitude: null,
        startDate: '2026-01-01',
      },
      profile,
      parentInfo: {
        parentId: expectOk(administrativeAreaId(PARENT_ID), 'parentId'),
        parentLevel: AdministrativeLevel.LEVEL_1,
      },
      clock,
      ids,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.centroid).toBeNull();
  });

  // Invariant 12
  it('rejects area under a DRAFT profile', () => {
    const draft = draftGuineaProfile();
    const result = createAdministrativeArea({
      area: {
        areaId: '550e8400-e29b-41d4-a716-446655440002',
        level: AdministrativeLevel.LEVEL_1,
        code: 'TEST',
        officialName: 'Test',
        parentId: PARENT_ID,
        latitude: null,
        longitude: null,
        startDate: '2026-01-01',
      },
      profile: draft,
      parentInfo: {
        parentId: expectOk(administrativeAreaId(PARENT_ID), 'parentId'),
        parentLevel: AdministrativeLevel.COUNTRY,
      },
      clock,
      ids,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.PROFILE_NOT_PUBLISHED);
    }
  });

  // Invariant 11
  it('rejects a level not declared in the profile', () => {
    // Guinea profile has LEVEL_1..4, but no COUNTRY in registerable levels.
    // We can test by creating a profile with fewer levels.
    const code = expectOk(countryCode('GN'), 'countryCode');
    const limitedLevels = [
      expectOk(
        levelDefinition({
          level: AdministrativeLevel.LEVEL_1,
          label: { singular: 'Région', plural: 'Régions' },
        }),
        'level 1',
      ),
      expectOk(
        levelDefinition({
          level: AdministrativeLevel.LEVEL_2,
          label: { singular: 'Préfecture', plural: 'Préfectures' },
        }),
        'level 2',
      ),
    ];
    const limitedProfile = expectOk(
      CountryProfile.register(
        { countryCode: code, levels: limitedLevels },
        { clock, ids },
      ),
      'register limited profile',
    );
    expectOk(limitedProfile.publish(), 'publish limited');

    // Try to register a LEVEL_3 area — not in the profile
    const result = createAdministrativeArea({
      area: {
        areaId: '550e8400-e29b-41d4-a716-446655440003',
        level: AdministrativeLevel.LEVEL_3,
        code: 'TEST',
        officialName: 'Test',
        parentId: PARENT_ID,
        latitude: null,
        longitude: null,
        startDate: '2026-01-01',
      },
      profile: limitedProfile,
      parentInfo: {
        parentId: expectOk(administrativeAreaId(PARENT_ID), 'parentId'),
        parentLevel: AdministrativeLevel.LEVEL_2,
      },
      clock,
      ids,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(
        GeographyRule.LEVEL_NOT_DECLARED_IN_PROFILE,
      );
    }
  });

  // Invariant 9
  it('rejects parent with wrong level (skip)', () => {
    const result = createAdministrativeArea({
      area: {
        areaId: '550e8400-e29b-41d4-a716-446655440004',
        level: AdministrativeLevel.LEVEL_3,
        code: 'TEST',
        officialName: 'Test',
        parentId: PARENT_ID,
        latitude: null,
        longitude: null,
        startDate: '2026-01-01',
      },
      profile,
      // Parent is LEVEL_1 but child is LEVEL_3 — should be LEVEL_2
      parentInfo: {
        parentId: expectOk(administrativeAreaId(PARENT_ID), 'parentId'),
        parentLevel: AdministrativeLevel.LEVEL_1,
      },
      clock,
      ids,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.PARENT_LEVEL_MISMATCH);
    }
  });

  it('propagates an invalid area code', () => {
    const result = createAdministrativeArea({
      area: {
        areaId: '550e8400-e29b-41d4-a716-446655440005',
        level: AdministrativeLevel.LEVEL_2,
        code: '  ', // empty after trim
        officialName: 'Test',
        parentId: PARENT_ID,
        latitude: null,
        longitude: null,
        startDate: '2026-01-01',
      },
      profile,
      parentInfo: {
        parentId: expectOk(administrativeAreaId(PARENT_ID), 'parentId'),
        parentLevel: AdministrativeLevel.LEVEL_1,
      },
      clock,
      ids,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_AREA_CODE);
    }
  });

  it('propagates an invalid area id', () => {
    const result = createAdministrativeArea({
      area: {
        areaId: 'not-a-uuid',
        level: AdministrativeLevel.LEVEL_2,
        code: 'TEST',
        officialName: 'Test',
        parentId: PARENT_ID,
        latitude: null,
        longitude: null,
        startDate: '2026-01-01',
      },
      profile,
      parentInfo: {
        parentId: expectOk(administrativeAreaId(PARENT_ID), 'parentId'),
        parentLevel: AdministrativeLevel.LEVEL_1,
      },
      clock,
      ids,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_AREA_ID);
    }
  });
});
