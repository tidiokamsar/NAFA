/**
 * The JSON contract the products import CLI consumes.
 *
 * One file = a catalogue extract. Products are independent of each other
 * (no hierarchy), so the file is a flat list.
 */

export interface ImportUnitInput {
  readonly code: string;
  readonly name: string;
  readonly kind: 'WEIGHT' | 'VOLUME' | 'COUNT';
  /** The metric base this unit converts to (KG / L / UNIT); omit for the base itself. */
  readonly baseUnit?: string;
  readonly factorToBase: number;
}

export interface ImportProductInput {
  readonly code: string;
  readonly category: string; // CEREAL..PROCESSED (generic enum, ADR-0010)
  readonly officialName: string;
  readonly aliases?: readonly string[];
  readonly units: readonly ImportUnitInput[];
}

export interface ImportFile {
  readonly products: readonly ImportProductInput[];
}

/** Narrows an untyped parsed JSON value into ImportFile, with clear errors. */
export function parseImportFile(raw: unknown): ImportFile {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Import file: expected a JSON object at the root.');
  }
  const file = raw as Record<string, unknown>;

  if (!Array.isArray(file.products)) {
    throw new Error('Import file: products (array) is required.');
  }

  return file as unknown as ImportFile;
}
