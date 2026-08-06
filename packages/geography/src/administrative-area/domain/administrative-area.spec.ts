import { FixedClock, SequentialIdGenerator } from '@nafa/shared';
import { AdministrativeLevel } from '../../country-profile/domain/administrative-level.vo';
import { levelDefinition } from '../../country-profile/domain/level-definition.vo';
import { countryCode } from '../../country-profile/domain/country-code.vo';
import {
  CountryProfile,
  type RegisterCountryProfileInput,
} from '../../country-profile/domain/country-profile.aggregate';
import { GeographyRule } from '../../country-profile/domain/country-profile.errors';
import { administrativeAreaId } from './administrative-area-id.vo';
import { areaCode } from './area-code.vo';
import { areaName } from './area-name.vo';
import { geoPoint } from './geo-point.vo';
import { validityPeriod } from './validity-period.vo';
import { AreaStatus } from './area-status.vo';
import { checkAreaTransition } from './area-status.vo';
import {
  AdministrativeArea,
  type RegisterAdministrativeAreaInput,
  validateParentChildLevels,
  validateLevelDeclaredInProfile,
} from './administrative-area.aggregate';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clock = new FixedClock(new Date('2026-01-15T10:00:00Z'));
const ids = new SequentialIdGenerator();
const deps = { clock, ids };

/** Unwrap a Result throwing on failure — only for test helpers with known-valid data. */
function expectOk<T, E>(
  result: { readonly ok: boolean; readonly value?: T; readonly error?: E },
  msg: string,
): T {
  if (result.ok) return result.value!;
  throw new Error(`${msg}: ${result.error}`);
}

/** Builds a valid Guinea profile (4 levels, PUBLISHED). */
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
    CountryProfile.register(input, deps),
    'register Guinea',
  );
  expectOk(profile.publish(), 'publish Guinea');
  return profile;
}

/** Builds a valid AREA_ID UUID. */
const AREA_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const PARENT_ID = 'f1e2d3c4-b5a6-4f7e-8d9c-0b1a2f3e4d5c';
const SUCCESSOR_1 = '11111111-2222-4333-a444-555555555555';
const SUCCESSOR_2 = '66666666-7777-4888-b999-000000000000';

/** Builds a valid LEVEL_2 (Prefecture) registration input with all VOs pre-validated. */
function level2Input(): RegisterAdministrativeAreaInput {
  return {
    areaId: expectOk(administrativeAreaId(AREA_ID), 'areaId'),
    countryCode: expectOk(countryCode('GN'), 'countryCode'),
    level: AdministrativeLevel.LEVEL_2,
    code: expectOk(areaCode('KIND'), 'areaCode'),
    name: expectOk(
      areaName({ official: 'Kindia', aliases: ['Kindya'] }),
      'areaName',
    ),
    parentId: expectOk(administrativeAreaId(PARENT_ID), 'parentId'),
    centroid: expectOk(
      geoPoint({ latitude: 10.06, longitude: -12.86 }),
      'geoPoint',
    ),
    validity: expectOk(validityPeriod({ startDate: '2026-01-01' }), 'validity'),
  };
}

/** Builds a COUNTRY-level registration input (Guinea root). */
function countryInput(): RegisterAdministrativeAreaInput {
  return {
    areaId: expectOk(administrativeAreaId(AREA_ID), 'areaId'),
    countryCode: expectOk(countryCode('GN'), 'countryCode'),
    level: AdministrativeLevel.COUNTRY,
    code: expectOk(areaCode('GN'), 'areaCode'),
    name: expectOk(areaName({ official: 'Guinea' }), 'areaName'),
    parentId: null,
    centroid: expectOk(
      geoPoint({ latitude: 9.94, longitude: -9.7 }),
      'geoPoint',
    ),
    validity: expectOk(validityPeriod({ startDate: '2026-01-01' }), 'validity'),
  };
}

function registerLevel2(): AdministrativeArea {
  return expectOk(
    AdministrativeArea.register(level2Input(), deps),
    'register LEVEL_2',
  );
}

function registerCountry(): AdministrativeArea {
  return expectOk(
    AdministrativeArea.register(countryInput(), deps),
    'register COUNTRY',
  );
}

// ===========================================================================
// Value objects
// ===========================================================================

describe('administrativeAreaId VO', () => {
  it('accepts a valid UUID', () => {
    const result = administrativeAreaId('550e8400-e29b-41d4-a716-446655440000');
    expect(result.ok).toBe(true);
  });

  it('accepts uppercase UUID', () => {
    const result = administrativeAreaId('550E8400-E29B-41D4-A716-446655440000');
    expect(result.ok).toBe(true);
  });

  it('rejects non-UUID string', () => {
    const result = administrativeAreaId('not-a-uuid');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_AREA_ID);
    }
  });

  it('rejects empty string', () => {
    const result = administrativeAreaId('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_AREA_ID);
    }
  });

  it('trims whitespace', () => {
    const result = administrativeAreaId(
      '  550e8400-e29b-41d4-a716-446655440000  ',
    );
    expect(result.ok).toBe(true);
  });
});

describe('areaCode VO', () => {
  it('accepts a valid code', () => {
    const result = areaCode('KIND');
    expect(result.ok).toBe(true);
  });

  it('rejects empty string', () => {
    const result = areaCode('  ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_AREA_CODE);
    }
  });

  it('rejects code exceeding 50 characters', () => {
    const result = areaCode('X'.repeat(51));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_AREA_CODE);
    }
  });

  it('trims whitespace', () => {
    const result = areaCode('  KIND  ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('KIND');
    }
  });
});

describe('areaName VO', () => {
  it('accepts official name without aliases', () => {
    const result = areaName({ official: 'Kindia' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.official).toBe('Kindia');
      expect(result.value.aliases).toHaveLength(0);
    }
  });

  it('accepts official name with aliases', () => {
    const result = areaName({
      official: 'Kindia',
      aliases: ['Kindya', 'Kindía'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.aliases).toEqual(['Kindya', 'Kindía']);
    }
  });

  it('rejects empty official name', () => {
    const result = areaName({ official: '  ' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_AREA_NAME);
    }
  });

  it('rejects empty alias', () => {
    const result = areaName({ official: 'Kindia', aliases: ['Kindya', ''] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_AREA_NAME);
      expect(result.error.message).toContain('aliases');
    }
  });

  it('trims official name and aliases', () => {
    const result = areaName({
      official: '  Kindia  ',
      aliases: ['  Kindya  '],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.official).toBe('Kindia');
      expect(result.value.aliases).toEqual(['Kindya']);
    }
  });
});

describe('geoPoint VO', () => {
  it('accepts valid coordinates', () => {
    const result = geoPoint({ latitude: 10.06, longitude: -12.86 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.latitude).toBe(10.06);
      expect(result.value.longitude).toBe(-12.86);
    }
  });

  it('rejects latitude > 90', () => {
    const result = geoPoint({ latitude: 91, longitude: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_CENTROID);
      expect(result.error.message).toContain('Latitude');
    }
  });

  it('rejects latitude < -90', () => {
    const result = geoPoint({ latitude: -91, longitude: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_CENTROID);
    }
  });

  it('rejects longitude > 180', () => {
    const result = geoPoint({ latitude: 0, longitude: 181 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_CENTROID);
      expect(result.error.message).toContain('Longitude');
    }
  });

  it('rejects longitude < -180', () => {
    const result = geoPoint({ latitude: 0, longitude: -181 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_CENTROID);
    }
  });

  it('accepts boundary values', () => {
    const result = geoPoint({ latitude: 90, longitude: 180 });
    expect(result.ok).toBe(true);
  });
});

describe('validityPeriod VO', () => {
  it('accepts start date only', () => {
    const result = validityPeriod({ startDate: '2026-01-01' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.startDate).toBe('2026-01-01');
      expect(result.value.endDate).toBeNull();
    }
  });

  it('accepts start and end dates', () => {
    const result = validityPeriod({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.endDate).toBe('2026-12-31');
    }
  });

  it('rejects end date before start date', () => {
    const result = validityPeriod({
      startDate: '2026-12-31',
      endDate: '2026-01-01',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_PERIOD);
    }
  });

  it('accepts end date equal to start date', () => {
    const result = validityPeriod({
      startDate: '2026-01-01',
      endDate: '2026-01-01',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects malformed start date', () => {
    const result = validityPeriod({ startDate: 'not-a-date' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_PERIOD);
    }
  });
});

describe('AreaStatus transitions', () => {
  it('allows ACTIVE → MERGED', () => {
    expect(checkAreaTransition(AreaStatus.ACTIVE, AreaStatus.MERGED).ok).toBe(
      true,
    );
  });

  it('allows ACTIVE → SPLIT', () => {
    expect(checkAreaTransition(AreaStatus.ACTIVE, AreaStatus.SPLIT).ok).toBe(
      true,
    );
  });

  it('allows ACTIVE → DISSOLVED', () => {
    expect(
      checkAreaTransition(AreaStatus.ACTIVE, AreaStatus.DISSOLVED).ok,
    ).toBe(true);
  });

  it('forbids ACTIVE → ACTIVE (same status)', () => {
    const result = checkAreaTransition(AreaStatus.ACTIVE, AreaStatus.ACTIVE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_STATUS_TRANSITION);
    }
  });

  it('forbids MERGED → ACTIVE', () => {
    const result = checkAreaTransition(AreaStatus.MERGED, AreaStatus.ACTIVE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_STATUS_TRANSITION);
    }
  });

  it('forbids DISSOLVED → MERGED', () => {
    const result = checkAreaTransition(AreaStatus.DISSOLVED, AreaStatus.MERGED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_STATUS_TRANSITION);
    }
  });
});

// ===========================================================================
// Hierarchy policy (pure functions)
// ===========================================================================

describe('validateParentChildLevels', () => {
  it('accepts COUNTRY → LEVEL_1', () => {
    const result = validateParentChildLevels(
      AdministrativeLevel.COUNTRY,
      AdministrativeLevel.LEVEL_1,
    );
    expect(result.ok).toBe(true);
  });

  it('accepts LEVEL_1 → LEVEL_2', () => {
    const result = validateParentChildLevels(
      AdministrativeLevel.LEVEL_1,
      AdministrativeLevel.LEVEL_2,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects LEVEL_1 → LEVEL_3 (skip)', () => {
    const result = validateParentChildLevels(
      AdministrativeLevel.LEVEL_1,
      AdministrativeLevel.LEVEL_3,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.PARENT_LEVEL_MISMATCH);
    }
  });

  it('rejects LEVEL_2 → LEVEL_1 (wrong direction)', () => {
    const result = validateParentChildLevels(
      AdministrativeLevel.LEVEL_2,
      AdministrativeLevel.LEVEL_1,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.PARENT_LEVEL_MISMATCH);
    }
  });
});

describe('validateLevelDeclaredInProfile', () => {
  const profile = publishedGuineaProfile();

  it('accepts LEVEL_1 declared in Guinea profile', () => {
    const result = validateLevelDeclaredInProfile(
      AdministrativeLevel.LEVEL_1,
      profile.levels,
    );
    expect(result.ok).toBe(true);
  });

  it('accepts LEVEL_4 declared in Guinea profile', () => {
    const result = validateLevelDeclaredInProfile(
      AdministrativeLevel.LEVEL_4,
      profile.levels,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects COUNTRY (never declared in registerable levels)', () => {
    // COUNTRY is never in the registerable levels list
    const result = validateLevelDeclaredInProfile(
      AdministrativeLevel.COUNTRY,
      profile.levels,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(
        GeographyRule.LEVEL_NOT_DECLARED_IN_PROFILE,
      );
    }
  });
});

// ===========================================================================
// Aggregate — register
// ===========================================================================

describe('AdministrativeArea.register', () => {
  it('registers a LEVEL_2 area', () => {
    const area = registerLevel2();
    expect(area.status).toBe(AreaStatus.ACTIVE);
    expect(area.level).toBe(AdministrativeLevel.LEVEL_2);
    expect(area.name.official).toBe('Kindia');
    expect(area.code).toBe('KIND');
    expect(area.parentId).toBe(PARENT_ID);
    expect(area.centroid).not.toBeNull();
    expect(area.centroid!.latitude).toBe(10.06);
    expect(area.successors).toHaveLength(0);
    expect(area.pullEvents()).toHaveLength(1);
  });

  it('registers a COUNTRY-level area without parent', () => {
    const area = registerCountry();
    expect(area.status).toBe(AreaStatus.ACTIVE);
    expect(area.level).toBe(AdministrativeLevel.COUNTRY);
    expect(area.parentId).toBeNull();
    expect(area.pullEvents()).toHaveLength(1);
  });

  it('registers an area without centroid', () => {
    const input = level2Input();
    const inputNoCentroid: RegisterAdministrativeAreaInput = {
      ...input,
      centroid: null,
    };
    const area = expectOk(
      AdministrativeArea.register(inputNoCentroid, deps),
      'register no centroid',
    );
    expect(area.centroid).toBeNull();
  });

  // Invariant 10
  it('rejects COUNTRY-level area with a parent', () => {
    const input = countryInput();
    const badInput: RegisterAdministrativeAreaInput = {
      ...input,
      parentId: expectOk(administrativeAreaId(PARENT_ID), 'parentId'),
    };
    const result = AdministrativeArea.register(badInput, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.ROOT_CANNOT_HAVE_PARENT);
    }
  });

  // Invariant 9 / 10
  it('rejects non-COUNTRY area without parent', () => {
    const input = level2Input();
    const badInput: RegisterAdministrativeAreaInput = {
      ...input,
      parentId: null,
    };
    const result = AdministrativeArea.register(badInput, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.NON_ROOT_REQUIRES_PARENT);
    }
  });
});

// ===========================================================================
// Aggregate — rename
// ===========================================================================

describe('AdministrativeArea.rename', () => {
  it('renames the official name', () => {
    const area = registerLevel2();
    const newName = expectOk(
      areaName({ official: 'Koundara', aliases: ['Koundara Prefecture'] }),
      'newName',
    );
    const result = area.rename(newName);
    expect(result.ok).toBe(true);
    expect(area.name.official).toBe('Koundara');
    expect(area.pullEvents()).toHaveLength(2); // registered + renamed
  });

  it('rejects rename on non-ACTIVE area', () => {
    const area = registerLevel2();
    const successor = expectOk(administrativeAreaId(SUCCESSOR_1), 'successor');
    expectOk(area.merge([successor]), 'merge');

    const newName = expectOk(areaName({ official: 'New Name' }), 'newName');
    const result = area.rename(newName);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_STATUS_TRANSITION);
    }
  });
});

// ===========================================================================
// Aggregate — changeAliases
// ===========================================================================

describe('AdministrativeArea.changeAliases', () => {
  it('replaces aliases', () => {
    const area = registerLevel2();
    const result = area.changeAliases(['Kindya', 'Kindía']);
    expect(result.ok).toBe(true);
    expect(area.name.aliases).toEqual(['Kindya', 'Kindía']);
  });

  it('rejects empty alias string', () => {
    const area = registerLevel2();
    const result = area.changeAliases(['Kindya', '  ']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_AREA_NAME);
    }
  });

  it('rejects on non-ACTIVE area', () => {
    const area = registerLevel2();
    expectOk(area.dissolve(), 'dissolve');
    const result = area.changeAliases(['New']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_STATUS_TRANSITION);
    }
  });
});

// ===========================================================================
// Aggregate — reparent
// ===========================================================================

describe('AdministrativeArea.reparent', () => {
  it('reparents to a new parent', () => {
    const area = registerLevel2();
    const newParent = expectOk(
      administrativeAreaId('b1b2b3b4-b5b6-4b7b-8b9b-0b1b2b3b4b5b'),
      'newParent',
    );
    const result = area.reparent(newParent);
    expect(result.ok).toBe(true);
    expect(area.parentId).toBe(newParent);
  });

  it('rejects reparent on COUNTRY-level area', () => {
    const area = registerCountry();
    const newParent = expectOk(administrativeAreaId(PARENT_ID), 'parentId');
    const result = area.reparent(newParent);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.ROOT_CANNOT_HAVE_PARENT);
    }
  });

  it('rejects reparent to null on non-COUNTRY area', () => {
    const area = registerLevel2();
    const result = area.reparent(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.NON_ROOT_REQUIRES_PARENT);
    }
  });

  it('rejects reparent on non-ACTIVE area', () => {
    const area = registerLevel2();
    expectOk(area.dissolve(), 'dissolve');
    const newParent = expectOk(administrativeAreaId(PARENT_ID), 'parentId');
    const result = area.reparent(newParent);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_STATUS_TRANSITION);
    }
  });
});

// ===========================================================================
// Aggregate — setCentroid
// ===========================================================================

describe('AdministrativeArea.setCentroid', () => {
  it('sets the centroid', () => {
    const area = registerLevel2();
    const centroid = expectOk(
      geoPoint({ latitude: 10.5, longitude: -13.0 }),
      'geoPoint',
    );
    const result = area.setCentroid(centroid);
    expect(result.ok).toBe(true);
    expect(area.centroid).toEqual({ latitude: 10.5, longitude: -13.0 });
  });

  it('rejects on non-ACTIVE area', () => {
    const area = registerLevel2();
    expectOk(area.dissolve(), 'dissolve');
    const centroid = expectOk(
      geoPoint({ latitude: 10.5, longitude: -13.0 }),
      'geoPoint',
    );
    const result = area.setCentroid(centroid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_STATUS_TRANSITION);
    }
  });
});

// ===========================================================================
// Aggregate — merge (invariant 18)
// ===========================================================================

describe('AdministrativeArea.merge', () => {
  it('merges with one successor', () => {
    const area = registerLevel2();
    const successor = expectOk(administrativeAreaId(SUCCESSOR_1), 'successor');
    const result = area.merge([successor]);
    expect(result.ok).toBe(true);
    expect(area.status).toBe(AreaStatus.MERGED);
    expect(area.successors).toEqual([successor]);
    expect(area.pullEvents()).toHaveLength(2); // registered + merged
  });

  it('merges with multiple successors', () => {
    const area = registerLevel2();
    const s1 = expectOk(administrativeAreaId(SUCCESSOR_1), 's1');
    const s2 = expectOk(administrativeAreaId(SUCCESSOR_2), 's2');
    const result = area.merge([s1, s2]);
    expect(result.ok).toBe(true);
    expect(area.successors).toHaveLength(2);
  });

  // Invariant 18
  it('rejects merge with no successors', () => {
    const area = registerLevel2();
    const result = area.merge([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.SUCCESSORS_REQUIRED);
    }
  });

  it('rejects merge on non-ACTIVE area', () => {
    const area = registerLevel2();
    const successor = expectOk(administrativeAreaId(SUCCESSOR_1), 'successor');
    expectOk(area.merge([successor]), 'first merge');
    const result = area.merge([successor]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_STATUS_TRANSITION);
    }
  });
});

// ===========================================================================
// Aggregate — split (invariant 18)
// ===========================================================================

describe('AdministrativeArea.split', () => {
  it('splits into two successors', () => {
    const area = registerLevel2();
    const s1 = expectOk(administrativeAreaId(SUCCESSOR_1), 's1');
    const s2 = expectOk(administrativeAreaId(SUCCESSOR_2), 's2');
    const result = area.split([s1, s2]);
    expect(result.ok).toBe(true);
    expect(area.status).toBe(AreaStatus.SPLIT);
    expect(area.successors).toHaveLength(2);
  });

  // Invariant 18
  it('rejects split with only one successor', () => {
    const area = registerLevel2();
    const successor = expectOk(administrativeAreaId(SUCCESSOR_1), 'successor');
    const result = area.split([successor]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(
        GeographyRule.SPLIT_REQUIRES_TWO_SUCCESSORS,
      );
    }
  });

  it('rejects split with no successors', () => {
    const area = registerLevel2();
    const result = area.split([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(
        GeographyRule.SPLIT_REQUIRES_TWO_SUCCESSORS,
      );
    }
  });

  it('rejects split on non-ACTIVE area', () => {
    const area = registerLevel2();
    const s1 = expectOk(administrativeAreaId(SUCCESSOR_1), 's1');
    const s2 = expectOk(administrativeAreaId(SUCCESSOR_2), 's2');
    expectOk(area.merge([s1]), 'merge first');
    const result = area.split([s1, s2]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_STATUS_TRANSITION);
    }
  });
});

// ===========================================================================
// Aggregate — dissolve
// ===========================================================================

describe('AdministrativeArea.dissolve', () => {
  it('dissolves with no successors', () => {
    const area = registerLevel2();
    const result = area.dissolve();
    expect(result.ok).toBe(true);
    expect(area.status).toBe(AreaStatus.DISSOLVED);
    expect(area.successors).toHaveLength(0);
  });

  it('rejects dissolve on non-ACTIVE area', () => {
    const area = registerLevel2();
    expectOk(area.dissolve(), 'first dissolve');
    const result = area.dissolve();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.rule).toBe(GeographyRule.INVALID_STATUS_TRANSITION);
    }
  });
});

// ===========================================================================
// Aggregate — versioning
// ===========================================================================

describe('AdministrativeArea versioning', () => {
  it('increments version on each mutation', () => {
    const area = registerLevel2();
    expect(area.version).toBe(1);

    const centroid = expectOk(
      geoPoint({ latitude: 11.0, longitude: -14.0 }),
      'centroid',
    );
    expectOk(area.setCentroid(centroid), 'setCentroid');
    expect(area.version).toBe(2);

    const newName = expectOk(areaName({ official: 'New Kindia' }), 'newName');
    expectOk(area.rename(newName), 'rename');
    expect(area.version).toBe(3);
  });

  it('tracks expectedVersion separately from current version', () => {
    const area = registerLevel2();
    expect(area.expectedVersion).toBe(0);

    const centroid = expectOk(
      geoPoint({ latitude: 11.0, longitude: -14.0 }),
      'centroid',
    );
    expectOk(area.setCentroid(centroid), 'setCentroid');
    expect(area.expectedVersion).toBe(0);
    expect(area.version).toBe(2);
  });
});

// ===========================================================================
// Aggregate — snapshot / rehydrate
// ===========================================================================

describe('AdministrativeArea snapshot round-trip', () => {
  it('survives a snapshot → rehydrate cycle', () => {
    const area = registerLevel2();
    const snapshot = area.snapshot();

    const restored = AdministrativeArea.rehydrate(snapshot, deps);
    expect(restored.areaId).toBe(area.areaId);
    expect(restored.countryCode).toBe(area.countryCode);
    expect(restored.level).toBe(area.level);
    expect(restored.code).toBe(area.code);
    expect(restored.name.official).toBe(area.name.official);
    expect(restored.name.aliases).toEqual(area.name.aliases);
    expect(restored.parentId).toBe(area.parentId);
    expect(restored.centroid).toEqual(area.centroid);
    expect(restored.validity).toEqual(area.validity);
    expect(restored.status).toBe(area.status);
    expect(restored.successors).toEqual(area.successors);
    expect(restored.version).toBe(area.version);
    expect(restored.expectedVersion).toBe(area.version);
  });

  it('rehydrated area has no pending events', () => {
    const area = registerLevel2();
    const snapshot = area.snapshot();
    const restored = AdministrativeArea.rehydrate(snapshot, deps);
    expect(restored.pullEvents()).toHaveLength(0);
  });
});

// ===========================================================================
// Aggregate — accessors
// ===========================================================================

describe('AdministrativeArea accessors', () => {
  it('successors returns a copy', () => {
    const area = registerLevel2();
    const s1 = expectOk(administrativeAreaId(SUCCESSOR_1), 's1');
    expectOk(area.merge([s1]), 'merge');
    const successors = area.successors;
    expect(successors).toHaveLength(1);
    // Mutating the returned array should not affect the aggregate
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (successors as any).push('fake-id');
    expect(area.successors).toHaveLength(1);
  });

  it('levels returns the registered level', () => {
    const area = registerLevel2();
    expect(area.level).toBe(AdministrativeLevel.LEVEL_2);
  });
});
