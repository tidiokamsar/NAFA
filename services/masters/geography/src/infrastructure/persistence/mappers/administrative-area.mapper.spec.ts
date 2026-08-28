import {
  AdministrativeLevel,
  type AdministrativeAreaSnapshot,
} from '@nafa/geography';
import {
  administrativeAreaToRow,
  administrativeAreaToSnapshot,
  type AdministrativeAreaPrismaRow,
} from './administrative-area.mapper';

// Brand types are strings at the persistence layer — the mapper casts them,
// so fixtures use plain casts too.
const AREA_ID =
  '550e8400-e29b-41d4-a716-446655440000' as AdministrativeAreaSnapshot['areaId'];
const PARENT_ID =
  '660e8400-e29b-41d4-a716-446655440001' as AdministrativeAreaSnapshot['parentId'];

function makeSnapshot(
  overrides: Partial<AdministrativeAreaSnapshot> = {},
): AdministrativeAreaSnapshot {
  return {
    areaId: AREA_ID,
    countryCode: 'GN' as AdministrativeAreaSnapshot['countryCode'],
    level: AdministrativeLevel.LEVEL_2,
    code: 'KND' as AdministrativeAreaSnapshot['code'],
    name: { official: 'Kindia', aliases: ['Kindya'] },
    parentId: null,
    centroid: null,
    validity: {
      startDate:
        '2026-01-01' as AdministrativeAreaSnapshot['validity']['startDate'],
      endDate: null,
    },
    status: 'ACTIVE' as AdministrativeAreaSnapshot['status'],
    successors: [],
    version: 3,
    ...overrides,
  };
}

describe('administrativeArea mapper', () => {
  it('round-trips a minimal snapshot (null centroid, no parent, no successors)', () => {
    const snapshot = makeSnapshot();

    const row = administrativeAreaToRow(snapshot);
    expect(row.id).toBe(AREA_ID);
    expect(row.name).toEqual({ official: 'Kindia', aliases: ['Kindya'] });
    expect(row.centroid).toBeNull();
    expect(row.validFrom).toBe('2026-01-01');
    expect(row.validTo).toBeNull();
    expect(row.successors).toEqual([]);

    const back = administrativeAreaToSnapshot(
      row as unknown as AdministrativeAreaPrismaRow,
    );
    expect(back).toEqual(snapshot);
  });

  it('round-trips a full snapshot (centroid, parent, successors, end date)', () => {
    const snapshot = makeSnapshot({
      parentId: PARENT_ID,
      centroid: { latitude: 10.06, longitude: -12.86 },
      validity: {
        startDate:
          '2026-01-01' as AdministrativeAreaSnapshot['validity']['startDate'],
        endDate:
          '2027-06-30' as AdministrativeAreaSnapshot['validity']['endDate'],
      },
      status: 'MERGED' as AdministrativeAreaSnapshot['status'],
      successors: [PARENT_ID as AdministrativeAreaSnapshot['areaId']],
    });

    const row = administrativeAreaToRow(snapshot);
    expect(row.parentId).toBe(PARENT_ID);
    expect(row.centroid).toEqual({ latitude: 10.06, longitude: -12.86 });
    expect(row.validTo).toBe('2027-06-30');
    expect(row.successors).toEqual([PARENT_ID]);

    const back = administrativeAreaToSnapshot(
      row as unknown as AdministrativeAreaPrismaRow,
    );
    expect(back).toEqual(snapshot);
  });

  it('keeps aliases as a mutable array in the row and restores them readonly', () => {
    const row = administrativeAreaToRow(
      makeSnapshot({ name: { official: 'Conakry', aliases: ['Konakry'] } }),
    );
    // The row is what Prisma serialises — a plain mutable JSON object.
    expect(Array.isArray(row.name.aliases)).toBe(true);
    expect(row.name.aliases).toEqual(['Konakry']);
  });
});
