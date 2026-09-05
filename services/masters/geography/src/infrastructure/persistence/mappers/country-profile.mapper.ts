import type { CountryProfileSnapshot } from '@nafa/geography';

/** The structural subset of a Prisma row the mapper reads. */
export interface CountryProfilePrismaRow {
  readonly id: string;
  readonly countryCode: string;
  readonly status: string;
  readonly levels: unknown;
  readonly version: number;
}

/** The structured levels payload stored in the JSON column. */
interface StoredLevel {
  level: string;
  label: { singular: string; plural: string };
}

/**
 * Maps between the domain snapshot and the persistence row.
 *
 * The snapshot carries brand types (CountryCode) which are plain strings at
 * the persistence layer. The `levels` JSON column holds the LevelDefinition[]
 * — at most four entries, read whole.
 */
export function countryProfileToRow(snapshot: CountryProfileSnapshot): {
  countryCode: string;
  status: string;
  levels: StoredLevel[];
  version: number;
} {
  return {
    countryCode: snapshot.countryCode,
    status: snapshot.status,
    levels: snapshot.levels.map((l) => ({
      level: l.level,
      label: { singular: l.label.singular, plural: l.label.plural },
    })),
    version: snapshot.version,
  };
}

export function countryProfileToSnapshot(
  row: CountryProfilePrismaRow,
): CountryProfileSnapshot {
  const levels = row.levels as StoredLevel[];
  return {
    countryCode: row.countryCode as CountryProfileSnapshot['countryCode'],
    status: row.status as CountryProfileSnapshot['status'],
    levels: levels.map((l) => ({
      level: l.level as CountryProfileSnapshot['levels'][number]['level'],
      label: { singular: l.label.singular, plural: l.label.plural },
    })),
    version: row.version,
  };
}
