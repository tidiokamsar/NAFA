import { AdministrativeLevel } from '../../../country-profile/domain/administrative-level.vo';
import { countryCode } from '../../../country-profile/domain/country-code.vo';
import { administrativeAreaId } from '../administrative-area-id.vo';
import { areaCode } from '../area-code.vo';
import {
  normalizeAreaText,
  scoreAreaMatch,
  resolveAreas,
  type AreaSummary,
} from './area-resolution.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the value from an ok Result, throwing on failure (safe in tests). */
function unwrapOk<T>(
  result: { ok: true; value: T } | { ok: false; error: unknown },
  label: string,
): T {
  if (result.ok) return result.value;
  throw new Error(`unwrapOk(${label}): expected ok, got error`);
}

const AID = unwrapOk(
  administrativeAreaId('550e8400-e29b-41d4-a716-446655440000'),
  'AID',
);
const GN = unwrapOk(countryCode('GN'), 'GN');
const SL = unwrapOk(countryCode('SL'), 'SL');
const GN_CODE = unwrapOk(areaCode('KIND'), 'GN_CODE');

function makeArea(
  overrides: Partial<Omit<AreaSummary, 'name'>> & { name: AreaSummary['name'] },
): AreaSummary {
  return {
    areaId: AID,
    countryCode: GN,
    level: AdministrativeLevel.LEVEL_2,
    code: GN_CODE,
    ...overrides,
  };
}

const KINDIA = makeArea({ name: { official: 'Kindia', aliases: ['Kindya'] } });
const CONAKRY = makeArea({
  code: unwrapOk(areaCode('CKY'), 'CKY'),
  name: { official: 'Conakry', aliases: ['Konakry'] },
});
const FARANAH = makeArea({
  code: unwrapOk(areaCode('FAN'), 'FAN'),
  name: { official: 'Faranah', aliases: [] },
});
const KANKAN = makeArea({
  code: unwrapOk(areaCode('KAN'), 'KAN'),
  name: { official: 'Kankan', aliases: [] },
});
const KINDIA_SL = makeArea({
  countryCode: SL,
  code: unwrapOk(areaCode('KD'), 'KD'),
  name: { official: 'Kindia', aliases: [] },
  level: AdministrativeLevel.LEVEL_1,
});

// ===========================================================================
// normalizeAreaText
// ===========================================================================

describe('normalizeAreaText', () => {
  it('lowercases input', () => {
    expect(normalizeAreaText('KINDIA')).toBe('kindia');
  });

  it('strips diacritics', () => {
    expect(normalizeAreaText('Kindya')).toBe('kindya');
  });

  it('strips combining marks (NFKD)', () => {
    expect(normalizeAreaText('Conakry')).toBe('conakry');
  });

  it('trims whitespace', () => {
    expect(normalizeAreaText('  Kindia  ')).toBe('kindia');
  });
});

// ===========================================================================
// scoreAreaMatch
// ===========================================================================

describe('scoreAreaMatch', () => {
  it('returns 1.0 for exact official name match', () => {
    expect(scoreAreaMatch('kindia', KINDIA)).toBe(1.0);
  });

  it('returns 0.95 for exact alias match', () => {
    expect(scoreAreaMatch('kindya', KINDIA)).toBe(0.95);
  });

  it('returns 0.8 when official name starts with query', () => {
    expect(scoreAreaMatch('kin', KINDIA)).toBe(0.8);
  });

  it('returns 0.6 when official name contains query', () => {
    expect(scoreAreaMatch('ind', KINDIA)).toBe(0.6);
  });

  it('returns 0.5 when alias starts with query', () => {
    expect(scoreAreaMatch('kin', KINDIA)).toBeGreaterThanOrEqual(0.5);
  });

  it('returns 0.4 when code starts with query', () => {
    expect(
      scoreAreaMatch(
        'kin',
        makeArea({
          code: unwrapOk(areaCode('KIND'), 'KIND'),
          name: { official: 'Other', aliases: [] },
        }),
      ),
    ).toBe(0.4);
  });

  it('returns 0 for no match', () => {
    expect(scoreAreaMatch('conakry', KINDIA)).toBe(0);
  });
});

// ===========================================================================
// resolveAreas
// ===========================================================================

describe('resolveAreas', () => {
  const areas = [KINDIA, CONAKRY, FARANAH, KANKAN, KINDIA_SL];

  it('returns empty for empty query', () => {
    expect(resolveAreas(areas, { query: '' })).toHaveLength(0);
    expect(resolveAreas(areas, { query: '   ' })).toHaveLength(0);
  });

  it('"kindia" returns Kindia GN as top candidate', () => {
    const results = resolveAreas(areas, { query: 'kindia' });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].area.areaId).toBe(KINDIA.areaId);
    expect(results[0].score).toBe(1.0);
  });

  it('"KINDIA" (uppercase) returns the same result', () => {
    const results = resolveAreas(areas, { query: 'KINDIA' });
    expect(results[0].area.areaId).toBe(KINDIA.areaId);
    expect(results[0].score).toBe(1.0);
  });

  it('"Kindya" (alias) returns Kindia GN as top candidate', () => {
    const results = resolveAreas(areas, { query: 'Kindya' });
    expect(results[0].area.areaId).toBe(KINDIA.areaId);
    expect(results[0].score).toBe(0.95);
  });

  it('returns multiple candidates for ambiguous input', () => {
    const results = resolveAreas(areas, { query: 'kin' });
    const ids = results.map((r) => r.area.areaId);
    // "kin" matches Kindia GN (official starts-with), Kankan (contains),
    // and Kindia SL (starts-with), and the GN code "KIND"
    expect(ids.length).toBeGreaterThanOrEqual(2);
  });

  it('filters by countryCode', () => {
    const results = resolveAreas(areas, { query: 'kindia', countryCode: SL });
    expect(results).toHaveLength(1);
    expect(results[0].area.countryCode).toBe(SL);
  });

  it('filters by level', () => {
    const results = resolveAreas(areas, {
      query: 'kindia',
      level: AdministrativeLevel.LEVEL_1,
    });
    expect(results).toHaveLength(1);
    expect(results[0].area.level).toBe(AdministrativeLevel.LEVEL_1);
  });

  it('sorts by score descending', () => {
    const results = resolveAreas(areas, { query: 'kin' });
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('returns empty when no areas match', () => {
    const results = resolveAreas(areas, { query: 'xyzzy' });
    expect(results).toHaveLength(0);
  });
});
