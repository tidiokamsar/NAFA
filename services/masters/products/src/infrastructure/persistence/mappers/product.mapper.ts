import type { ProductSnapshot, UnitOfMeasure } from '@nafa/products';

/** The structural subset of a Prisma row the mapper reads. */
export interface ProductPrismaRow {
  readonly id: string;
  readonly code: string;
  readonly category: string;
  readonly name: unknown;
  readonly units: unknown;
  readonly status: string;
  readonly version: number;
}

/** The structured payloads stored in the JSON columns. */
interface StoredName {
  official: string;
  aliases: string[];
}
type StoredUnit = UnitOfMeasure;

/**
 * Maps between the domain snapshot and the persistence row.
 *
 * The snapshot carries brand types (ProductId, ProductCode) which are plain
 * strings at the persistence layer — the casts are deliberate and safe
 * because the brands were validated when the value objects were built. The
 * surrogate UUID never leaks into the domain: a product is identified by
 * its globally-unique code, but the row keeps its own id primary key and
 * the snapshot's productId rides along as that id.
 */
export function productToRow(snapshot: ProductSnapshot): {
  id: string;
  code: string;
  category: string;
  name: StoredName;
  units: StoredUnit[];
  status: string;
  version: number;
} {
  return {
    id: snapshot.productId,
    code: snapshot.code,
    category: snapshot.category,
    name: {
      official: snapshot.name.official,
      aliases: [...snapshot.name.aliases],
    },
    units: snapshot.units.map((u) => ({ ...u })),
    status: snapshot.status,
    version: snapshot.version,
  };
}

export function productToSnapshot(row: ProductPrismaRow): ProductSnapshot {
  const name = row.name as StoredName;
  const units = row.units as StoredUnit[];

  return {
    productId: row.id as ProductSnapshot['productId'],
    code: row.code as ProductSnapshot['code'],
    category: row.category as ProductSnapshot['category'],
    name: { official: name.official, aliases: name.aliases },
    units: units.map((u) => ({ ...u })),
    status: row.status as ProductSnapshot['status'],
    version: row.version,
  };
}
