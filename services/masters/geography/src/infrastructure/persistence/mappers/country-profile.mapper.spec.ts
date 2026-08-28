import {
  AdministrativeLevel,
  type CountryProfileSnapshot,
} from '@nafa/geography';
import {
  countryProfileToRow,
  countryProfileToSnapshot,
} from './country-profile.mapper';

function makeSnapshot(
  overrides: Partial<CountryProfileSnapshot> = {},
): CountryProfileSnapshot {
  return {
    countryCode: 'GN' as CountryProfileSnapshot['countryCode'],
    status: 'PUBLISHED' as CountryProfileSnapshot['status'],
    levels: [
      {
        level: AdministrativeLevel.LEVEL_1,
        label: { singular: 'Région', plural: 'Régions' },
      },
      {
        level: AdministrativeLevel.LEVEL_2,
        label: { singular: 'Préfecture', plural: 'Préfectures' },
      },
    ],
    version: 2,
    ...overrides,
  };
}

describe('countryProfile mapper', () => {
  it('round-trips a published two-level profile', () => {
    const snapshot = makeSnapshot();

    const row = countryProfileToRow(snapshot);
    expect(row.countryCode).toBe('GN');
    expect(row.status).toBe('PUBLISHED');
    expect(row.levels).toHaveLength(2);
    expect(row.levels[0]).toEqual({
      level: 'LEVEL_1',
      label: { singular: 'Région', plural: 'Régions' },
    });
    expect(row.version).toBe(2);

    const back = countryProfileToSnapshot({
      id: 'irrelevant-to-the-domain',
      countryCode: row.countryCode,
      status: row.status,
      levels: row.levels,
      version: row.version,
    });
    expect(back).toEqual(snapshot);
  });

  it('round-trips a draft profile with no levels', () => {
    const snapshot = makeSnapshot({
      status: 'DRAFT' as CountryProfileSnapshot['status'],
      levels: [],
      version: 1,
    });

    const row = countryProfileToRow(snapshot);
    expect(row.status).toBe('DRAFT');
    expect(row.levels).toEqual([]);

    const back = countryProfileToSnapshot({
      id: 'x',
      countryCode: row.countryCode,
      status: row.status,
      levels: row.levels,
      version: row.version,
    });
    expect(back).toEqual(snapshot);
  });

  it('drops the surrogate id — the domain knows only countryCode', () => {
    // The Prisma row carries a UUID primary key the aggregate never sees.
    // The mapper must accept a row with an id and not leak it into the
    // snapshot.
    const snapshot = countryProfileToSnapshot({
      id: '770e8400-e29b-41d4-a716-446655440002',
      countryCode: 'ML',
      status: 'DRAFT',
      levels: [],
      version: 1,
    });
    expect(Object.prototype.hasOwnProperty.call(snapshot, 'id')).toBe(false);
    expect(snapshot.countryCode).toBe('ML');
  });
});
