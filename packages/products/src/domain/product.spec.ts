import {
  FixedClock,
  UuidGenerator,
  type Clock,
  type IdGenerator,
} from '@nafa/shared';
import {
  Product,
  ProductCategory,
  ProductRule,
  ProductStatus,
  checkProductTransition,
  productId,
  productCode,
  productName,
  productCategory,
  unitOfMeasure,
  UnitKind,
} from './index';
import { createProduct } from './factories/product.factory';

const NOW = new Date('2026-01-15T10:00:00.000Z');

function deps(): { clock: Clock; ids: IdGenerator } {
  // Real UUID generator: event ids are opaque in these tests, and the
  // product id under test is always passed explicitly (FIXTURE_ID).
  return { clock: new FixedClock(NOW), ids: new UuidGenerator() };
}

function unwrapOk<T>(
  result: { ok: boolean; value?: T; error?: { message: string } },
  label: string,
): T {
  if (!result.ok) {
    throw new Error(`unwrapOk(${label}): ${result.error?.message}`);
  }
  return result.value as T;
}

function expectErr(
  result: { ok: boolean; error?: { rule: string } },
  rule: string,
): void {
  expect(result.ok).toBe(false);
  expect(result.error?.rule).toBe(rule);
}

// ---------------------------------------------------------------------------
// Fixtures — a minimal valid product: fonio in kilograms and 50kg bags.
// ---------------------------------------------------------------------------

const FIXTURE_ID = '550e8400-e29b-41d4-a716-446655440000';

function fixtureInput() {
  const d = deps();
  return {
    code: 'FONIO',
    category: 'CEREAL',
    officialName: 'Fonio',
    aliases: ['Findi', 'Hungry rice'],
    units: [
      {
        code: 'KG',
        name: 'Kilogramme',
        kind: UnitKind.WEIGHT,
        factorToBase: 1,
      },
      {
        code: 'SAC_50',
        name: 'Sac de 50 kg',
        kind: UnitKind.WEIGHT,
        baseUnit: 'KG',
        factorToBase: 50,
      },
    ],
    clock: d.clock,
    ids: new UuidGenerator(),
  };
}

function registeredProduct() {
  const product = unwrapOk(
    Product.register(
      {
        productId: unwrapOk(productId(FIXTURE_ID), 'id'),
        code: unwrapOk(productCode('FONIO'), 'code'),
        category: unwrapOk(productCategory('CEREAL'), 'category'),
        name: unwrapOk(
          productName({ official: 'Fonio', aliases: ['Findi'] }),
          'name',
        ),
        units: [
          unwrapOk(
            unitOfMeasure({
              code: 'KG',
              name: 'Kilogramme',
              kind: UnitKind.WEIGHT,
              factorToBase: 1,
            }),
            'kg',
          ),
          unwrapOk(
            unitOfMeasure({
              code: 'SAC_50',
              name: 'Sac 50',
              kind: UnitKind.WEIGHT,
              baseUnit: 'KG',
              factorToBase: 50,
            }),
            'sac',
          ),
        ],
      },
      deps(),
    ),
    'register',
  );
  return product;
}

// ===========================================================================
// VOs — invariant 1 (id), 3 (category), 4 (name), 5 (unit shape)
// ===========================================================================

describe('productId (invariant 1)', () => {
  it('accepts a UUID and canonicalises to lowercase', () => {
    expect(
      unwrapOk(productId('550E8400-E29B-41D4-A716-446655440000'), 'id'),
    ).toBe(FIXTURE_ID);
  });

  it('rejects a non-UUID', () => {
    expectErr(productId('fonio'), ProductRule.INVALID_PRODUCT_ID);
  });
});

describe('productCode (invariant 2, shape)', () => {
  it('uppercases so two spellings compare equal', () => {
    expect(unwrapOk(productCode('fonio'), 'code')).toBe('FONIO');
  });

  it('rejects too-short, too-long and dirty codes', () => {
    expectErr(productCode('A'), ProductRule.INVALID_PRODUCT_CODE);
    expectErr(productCode('A'.repeat(13)), ProductRule.INVALID_PRODUCT_CODE);
    expectErr(productCode('RIZ-BLE'), ProductRule.INVALID_PRODUCT_CODE);
  });
});

describe('productCategory (invariant 3)', () => {
  it('parses every generic category case-insensitively', () => {
    expect(unwrapOk(productCategory('cereal'), 'cat')).toBe(
      ProductCategory.CEREAL,
    );
    expect(unwrapOk(productCategory('cash_crop'), 'cat')).toBe(
      ProductCategory.CASH_CROP,
    );
  });

  it('refuses an unknown or country-specific filière', () => {
    expectErr(productCategory('LEGUME_FEU'), ProductRule.INVALID_CATEGORY);
    expectErr(
      productCategory('FILIERE_ANACARDE'),
      ProductRule.INVALID_CATEGORY,
    );
  });
});

describe('productName (invariant 4)', () => {
  it('deduplicates aliases differing only by case or spacing', () => {
    const name = unwrapOk(
      productName({
        official: 'Anacarde',
        aliases: ['Cajou', 'cajou', '  Cajou  '],
      }),
      'name',
    );
    expect(name.aliases).toEqual(['Cajou']);
  });

  it('refuses an empty official name or empty alias', () => {
    expectErr(
      productName({ official: '  ' }),
      ProductRule.INVALID_PRODUCT_NAME,
    );
    expectErr(
      productName({ official: 'Riz', aliases: [''] }),
      ProductRule.INVALID_PRODUCT_NAME,
    );
  });
});

describe('unitOfMeasure (invariant 5)', () => {
  it('builds a base unit with factor 1', () => {
    const kg = unwrapOk(
      unitOfMeasure({
        code: 'KG',
        name: 'Kilogramme',
        kind: UnitKind.WEIGHT,
        factorToBase: 1,
      }),
      'kg',
    );
    expect(kg.baseUnit).toBeUndefined();
  });

  it('builds a derived unit converting to the metric base of its kind', () => {
    const sac = unwrapOk(
      unitOfMeasure({
        code: 'SAC_50',
        name: 'Sac 50',
        kind: UnitKind.WEIGHT,
        baseUnit: 'KG',
        factorToBase: 50,
      }),
      'sac',
    );
    expect(sac.baseUnit).toBe('KG');
  });

  it('refuses a non-positive or non-finite factor', () => {
    expectErr(
      unitOfMeasure({
        code: 'X',
        name: 'X',
        kind: UnitKind.WEIGHT,
        factorToBase: 0,
      }),
      ProductRule.INVALID_UNIT,
    );
    expectErr(
      unitOfMeasure({
        code: 'X',
        name: 'X',
        kind: UnitKind.WEIGHT,
        factorToBase: Number.NaN,
      }),
      ProductRule.INVALID_UNIT,
    );
  });

  it('refuses a unit based on itself', () => {
    expectErr(
      unitOfMeasure({
        code: 'KG',
        name: 'Kg',
        kind: UnitKind.WEIGHT,
        baseUnit: 'KG',
        factorToBase: 1,
      }),
      ProductRule.INVALID_UNIT,
    );
  });

  it('refuses a cross-dimension base — a weight never converts to litres', () => {
    expectErr(
      unitOfMeasure({
        code: 'SAC_L',
        name: 'Sac',
        kind: UnitKind.WEIGHT,
        baseUnit: 'L',
        factorToBase: 2,
      }),
      ProductRule.INVALID_UNIT,
    );
  });
});

// ===========================================================================
// Status machine — invariant 6
// ===========================================================================

describe('checkProductTransition (invariant 6)', () => {
  it('allows exactly the forward path', () => {
    expect(
      checkProductTransition(ProductStatus.DRAFT, ProductStatus.PUBLISHED),
    ).toBe(true);
    expect(
      checkProductTransition(ProductStatus.PUBLISHED, ProductStatus.DEPRECATED),
    ).toBe(true);
  });

  it('refuses every other step', () => {
    expect(
      checkProductTransition(ProductStatus.DRAFT, ProductStatus.DEPRECATED),
    ).toBe(false);
    expect(
      checkProductTransition(ProductStatus.PUBLISHED, ProductStatus.DRAFT),
    ).toBe(false);
    expect(
      checkProductTransition(ProductStatus.DEPRECATED, ProductStatus.PUBLISHED),
    ).toBe(false);
    expect(
      checkProductTransition(ProductStatus.DRAFT, ProductStatus.DRAFT),
    ).toBe(false);
  });
});

// ===========================================================================
// Aggregate — register (invariant 5, aggregate part)
// ===========================================================================

describe('Product.register', () => {
  it('registers a DRAFT product with one registered event', () => {
    const product = registeredProduct();
    expect(product.status).toBe(ProductStatus.DRAFT);
    expect(product.code).toBe('FONIO');

    const events = product.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('product.registered');
    expect(events[0].aggregate).toBe('Product');
  });

  it('refuses a product with no unit (invariant 5)', () => {
    const result = Product.register(
      {
        productId: unwrapOk(productId(FIXTURE_ID), 'id'),
        code: unwrapOk(productCode('RIZ'), 'code'),
        category: unwrapOk(productCategory('CEREAL'), 'cat'),
        name: unwrapOk(productName({ official: 'Riz' }), 'name'),
        units: [],
      },
      deps(),
    );
    expectErr(result, ProductRule.INVALID_UNIT);
  });

  it('refuses a duplicate unit code (invariant 5)', () => {
    const kg = unwrapOk(
      unitOfMeasure({
        code: 'KG',
        name: 'Kg',
        kind: UnitKind.WEIGHT,
        factorToBase: 1,
      }),
      'kg',
    );
    const result = Product.register(
      {
        productId: unwrapOk(productId(FIXTURE_ID), 'id'),
        code: unwrapOk(productCode('RIZ'), 'code'),
        category: unwrapOk(productCategory('CEREAL'), 'cat'),
        name: unwrapOk(productName({ official: 'Riz' }), 'name'),
        units: [kg, kg],
      },
      deps(),
    );
    expectErr(result, ProductRule.DUPLICATE_UNIT);
  });
});

// ===========================================================================
// Aggregate — snapshot / rehydrate round-trip
// ===========================================================================

describe('snapshot / rehydrate', () => {
  it('round-trips without events and preserves expectedVersion', () => {
    const product = registeredProduct();
    product.pullEvents(); // drain

    const snapshot = product.snapshot();
    expect(snapshot.version).toBe(1);

    const revived = Product.rehydrate(snapshot, deps());
    expect(revived.snapshot()).toEqual(snapshot);
    expect(revived.pullEvents()).toHaveLength(0);
    expect(revived.expectedVersion).toBe(1);
  });
});

// ===========================================================================
// Mutations — lifecycle, immutability, invariants 6-8
// ===========================================================================

describe('Product lifecycle', () => {
  it('publishes then deprecates, emitting an event per step', () => {
    const product = registeredProduct();
    product.pullEvents();

    unwrapOk(product.publish(deps()), 'publish');
    expect(product.status).toBe(ProductStatus.PUBLISHED);

    unwrapOk(product.deprecate(deps()), 'deprecate');
    expect(product.status).toBe(ProductStatus.DEPRECATED);

    const events = product.pullEvents();
    expect(events.map((e) => e.eventType)).toEqual([
      'product.published',
      'product.deprecated',
    ]);
    expect(events.map((e) => e.version)).toEqual([2, 3]);
    // Absolute version advances with every event, drained or not;
    // expectedVersion stays at the load point — 0, never stored.
    expect(product.version).toBe(3);
    expect(product.expectedVersion).toBe(0);
  });

  it('refuses DRAFT → DEPRECATED (invariant 6)', () => {
    const product = registeredProduct();
    expectErr(product.deprecate(deps()), ProductRule.INVALID_STATUS_TRANSITION);
  });

  it('refuses un-publishing (invariant 6)', () => {
    const product = registeredProduct();
    unwrapOk(product.publish(deps()), 'publish');
    expectErr(product.publish(deps()), ProductRule.INVALID_STATUS_TRANSITION);
  });
});

describe('Product.rename', () => {
  it('renames and reports previous and new names', () => {
    const product = registeredProduct();
    product.pullEvents();

    const next = unwrapOk(
      productName({ official: 'Fonio blanchi', aliases: ['Findi'] }),
      'name',
    );
    unwrapOk(product.rename(next, deps()), 'rename');

    const events = product.pullEvents();
    expect(events[0].eventType).toBe('product.renamed');
    expect(product.name.official).toBe('Fonio blanchi');
  });

  it('refuses a no-op rename', () => {
    const product = registeredProduct();
    const same = unwrapOk(productName({ official: 'Fonio' }), 'name');
    expectErr(product.rename(same, deps()), ProductRule.INVALID_PRODUCT_NAME);
  });
});

describe('Product.changeAliases', () => {
  it('replaces the alias list', () => {
    const product = registeredProduct();
    product.pullEvents(); // drain the registered event
    unwrapOk(product.changeAliases(['Findi', 'Acha'], deps()), 'aliases');
    expect([...product.name.aliases]).toEqual(['Findi', 'Acha']);
    expect(product.pullEvents()[0].eventType).toBe('product.aliases-changed');
  });

  it('is allowed while PUBLISHED — the market invents names', () => {
    const product = registeredProduct();
    unwrapOk(product.publish(deps()), 'publish');
    const result = product.changeAliases(['Pibi'], deps());
    expect(result.ok).toBe(true);
  });
});

describe('immutability guards (invariants 7-8)', () => {
  it('freezes every mutation once DEPRECATED (invariant 8)', () => {
    const product = registeredProduct();
    unwrapOk(product.publish(deps()), 'publish');
    unwrapOk(product.deprecate(deps()), 'deprecate');

    const next = unwrapOk(productName({ official: 'X' }), 'name');
    expectErr(product.rename(next, deps()), ProductRule.PRODUCT_DEPRECATED);
    expectErr(
      product.changeAliases(['Y'], deps()),
      ProductRule.PRODUCT_DEPRECATED,
    );
    expectErr(product.publish(deps()), ProductRule.INVALID_STATUS_TRANSITION);
  });

  it('returns a defensive copy of units — mutating it does not corrupt the aggregate', () => {
    const product = registeredProduct();
    const units = product.units as unknown as { code: string }[];
    units.push({ code: 'HACKED' });
    expect(product.units).toHaveLength(2);
  });
});

// ===========================================================================
// Factory
// ===========================================================================

describe('createProduct (factory)', () => {
  it('builds a product from plain inputs, generating its own id', () => {
    const input = fixtureInput();
    const product = unwrapOk(
      createProduct({
        code: input.code,
        category: input.category,
        officialName: input.officialName,
        aliases: input.aliases,
        units: input.units,
        clock: input.clock,
        ids: input.ids,
      }),
      'factory',
    );
    expect(product.code).toBe('FONIO');
    expect(product.category).toBe(ProductCategory.CEREAL);
    expect(product.units).toHaveLength(2);
    expect(product.pullEvents()[0].eventType).toBe('product.registered');
  });

  it('propagates VO failures instead of wrapping them', () => {
    const bad = { ...fixtureInput(), code: 'X' };
    expectErr(createProduct(bad), ProductRule.INVALID_PRODUCT_CODE);

    const badCat = { ...fixtureInput(), category: 'NOPE' };
    expectErr(createProduct(badCat), ProductRule.INVALID_CATEGORY);
  });
});
