/**
 * The JSON contract the import CLI consumes.
 *
 * One file per country. The `country` block declares the level template;
 * the `areas` array lists the places, referenced by code so parents link
 * without knowing database ids in advance.
 */

export interface ImportLevelInput {
  readonly level: string; // LEVEL_1..LEVEL_4
  readonly singular: string;
  readonly plural: string;
}

export interface ImportAreaInput {
  readonly code: string;
  readonly level: string; // LEVEL_1..LEVEL_4
  readonly officialName: string;
  readonly aliases?: readonly string[];
  /** Code of the parent area; null for level-1 areas. */
  readonly parentCode: string | null;
  readonly latitude?: number;
  readonly longitude?: number;
  /** ISO date the area record starts from. Defaults to today. */
  readonly startDate?: string;
  readonly endDate?: string | null;
}

export interface ImportFile {
  readonly country: {
    readonly code: string; // ISO 3166-1 alpha-2
    readonly name: string; // official name — becomes the COUNTRY root area
    readonly levels: readonly ImportLevelInput[];
  };
  readonly areas: readonly ImportAreaInput[];
}

/** Narrows an untyped parsed JSON value into ImportFile, with clear errors. */
export function parseImportFile(raw: unknown): ImportFile {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Import file: expected a JSON object at the root.');
  }
  const file = raw as Record<string, unknown>;
  const country = file.country as Record<string, unknown> | null | undefined;

  if (
    typeof country !== 'object' ||
    country === null ||
    typeof country.code !== 'string' ||
    typeof country.name !== 'string' ||
    !Array.isArray(country.levels)
  ) {
    throw new Error(
      'Import file: country.code (string), country.name (string) and country.levels (array) are required.',
    );
  }

  if (!Array.isArray(file.areas)) {
    throw new Error('Import file: areas (array) is required.');
  }

  return file as unknown as ImportFile;
}
