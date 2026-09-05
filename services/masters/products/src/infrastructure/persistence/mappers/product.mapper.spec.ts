import {
  ProductCategory,
  ProductStatus,
  UnitKind,
  type ProductSnapshot,
} from '@nafa/products';
import {
  productToRow,
  productToSnapshot,
  type ProductPrismaRow,
} from './product.mapper';

const PRODUCT_ID =
  '550e8400-e29b-41d4-a716-446655440000' as ProductSnapshot['productId'];

function makeSnapshot(
  overrides: Partial<ProductSnapshot> = {},
): ProductSnapshot {
  return {
    productId: PRODUCT_ID,
    code: 'FONIO' as ProductSnapshot['code'],
    category: ProductCategory.CEREAL,
    name: { official: 'Fonio', aliases: ['Findi', 'Acha'] },
    units: [
      {
        code: 'KG' as never,
        name: 'Kilogramme',
        kind: UnitKind.WEIGHT,
        factorToBase: 1,
      },
      {
        code: 'SAC_50' as never,
        name: 'Sac de 50 kg',
        kind: UnitKind.WEIGHT,
        baseUnit: 'KG' as never,
        factorToBase: 50,
      },
    ],
    status: ProductStatus.PUBLISHED,
    version: 3,
    ...overrides,
  };
}

describe('product mapper', () => {
  it('round-trips a full snapshot — aliases and unit conversions intact', () => {
    const snapshot = makeSnapshot();

    const row = productToRow(snapshot);
    expect(row.code).toBe('FONIO');
    expect(row.name).toEqual({ official: 'Fonio', aliases: ['Findi', 'Acha'] });
    expect(row.units).toHaveLength(2);
    expect(row.units[1]).toEqual({
      code: 'SAC_50',
      name: 'Sac de 50 kg',
      kind: 'WEIGHT',
      baseUnit: 'KG',
      factorToBase: 50,
    });

    const back = productToSnapshot(row as unknown as ProductPrismaRow);
    expect(back).toEqual(snapshot);
  });

  it('round-trips a minimal snapshot — no aliases, single base unit', () => {
    const snapshot = makeSnapshot({
      code: 'RIZ' as ProductSnapshot['code'],
      category: ProductCategory.CEREAL,
      name: { official: 'Riz', aliases: [] },
      units: [
        {
          code: 'KG' as never,
          name: 'Kilogramme',
          kind: UnitKind.WEIGHT,
          factorToBase: 1,
        },
      ],
      status: ProductStatus.DRAFT,
      version: 1,
    });

    const back = productToSnapshot(
      productToRow(snapshot) as unknown as ProductPrismaRow,
    );
    expect(back).toEqual(snapshot);
    expect(back.units[0].baseUnit).toBeUndefined();
  });
});
