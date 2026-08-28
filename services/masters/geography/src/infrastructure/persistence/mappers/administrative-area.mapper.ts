import type { AdministrativeAreaSnapshot } from '@nafa/geography';

/**
 * The shape the adapter writes to Prisma. JSON columns are typed as
 * `InputJsonValue` by the generated client — structured objects, not `unknown`.
 */
export interface AdministrativeAreaWriteRow {
  readonly id: string;
  readonly countryCode: string;
  readonly level: string;
  readonly code: string;
  readonly name: { official: string; aliases: string[] };
  readonly parentId: string | null;
  readonly centroid: { latitude: number; longitude: number } | null;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly status: string;
  readonly successors: string[];
  readonly version: number;
}

/**
 * Maps between the domain snapshot and the persistence row.
 *
 * The snapshot decomposes validity into a single object (ValidityPeriod) and
 * stores the centroid with full-key names (latitude/longitude). The row
 * splits validity across two columns (validFrom/validTo) for indexability and
 * stores centroid as compact JSON. Brand types are strings at this layer.
 */
export function administrativeAreaToRow(
  snapshot: AdministrativeAreaSnapshot,
): AdministrativeAreaWriteRow {
  return {
    id: snapshot.areaId,
    countryCode: snapshot.countryCode,
    level: snapshot.level,
    code: snapshot.code,
    name: {
      official: snapshot.name.official,
      aliases: [...snapshot.name.aliases],
    },
    parentId: snapshot.parentId,
    centroid: snapshot.centroid
      ? {
          latitude: snapshot.centroid.latitude,
          longitude: snapshot.centroid.longitude,
        }
      : null,
    validFrom: snapshot.validity.startDate,
    validTo: snapshot.validity.endDate,
    status: snapshot.status,
    successors: [...snapshot.successors],
    version: snapshot.version,
  };
}

/**
 * Maps a raw Prisma row back to the domain snapshot.
 *
 * Prisma returns `JsonValue` for JSON columns; we cast through `unknown` to
 * the domain shape. The row was written by `administrativeAreaToRow`, so the
 * JSON structure is guaranteed to match.
 */
export function administrativeAreaToSnapshot(
  row: AdministrativeAreaPrismaRow,
): AdministrativeAreaSnapshot {
  const name = row.name as { official: string; aliases: string[] };
  const centroid = row.centroid as {
    latitude: number;
    longitude: number;
  } | null;
  const successors = row.successors as string[];

  return {
    areaId: row.id as AdministrativeAreaSnapshot['areaId'],
    countryCode: row.countryCode as AdministrativeAreaSnapshot['countryCode'],
    level: row.level as AdministrativeAreaSnapshot['level'],
    code: row.code as AdministrativeAreaSnapshot['code'],
    name: {
      official: name.official,
      aliases: name.aliases,
    },
    parentId: row.parentId as AdministrativeAreaSnapshot['parentId'],
    centroid: centroid
      ? { latitude: centroid.latitude, longitude: centroid.longitude }
      : null,
    validity: {
      startDate:
        row.validFrom as AdministrativeAreaSnapshot['validity']['startDate'],
      endDate: (row.validTo ??
        null) as AdministrativeAreaSnapshot['validity']['endDate'],
    },
    status: row.status as AdministrativeAreaSnapshot['status'],
    successors:
      successors as unknown as AdministrativeAreaSnapshot['successors'],
    version: row.version,
  };
}

/** The structural subset of a Prisma row the mapper reads. */
export interface AdministrativeAreaPrismaRow {
  readonly id: string;
  readonly countryCode: string;
  readonly level: string;
  readonly code: string;
  readonly name: unknown;
  readonly parentId: string | null;
  readonly centroid: unknown;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly status: string;
  readonly successors: unknown;
  readonly version: number;
}
