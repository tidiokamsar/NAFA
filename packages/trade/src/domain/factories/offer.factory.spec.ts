import { FixedClock, UuidGenerator } from '@nafa/shared';
import type { ActorId } from '@nafa/foundation';
import type { ProductId } from '@nafa/products';
import { createOffer } from './offer.factory';
import type { ProductCatalog } from '../ports/product-catalog.port';
import type { SellerRegistry } from '../ports/seller-registry.port';
import { TradeRule } from '../trade.errors';

const SELLER = '660e8400-e29b-41d4-a716-446655440001' as ActorId;
const PRODUCT = '770e8400-e29b-41d4-a716-446655440002' as ProductId;

function makePorts(
  overrides: {
    active?: boolean;
    units?: string[];
  } = {},
) {
  const catalog: ProductCatalog = {
    async getPublishedProduct() {
      return {
        productId: PRODUCT,
        units: (overrides.units ?? ['KG', 'SAC_50']) as never,
      };
    },
  };
  const sellers: SellerRegistry = {
    async isActive() {
      return overrides.active ?? true;
    },
  };
  return { catalog, sellers };
}

const deps = () => ({
  clock: new FixedClock(new Date('2026-09-05T10:00:00.000Z')),
  ids: new UuidGenerator(),
});

const baseInput = () => ({
  sellerId: SELLER,
  productId: PRODUCT,
  quantityValue: 500,
  unitCode: 'KG',
  priceAmountMinor: 12_000,
  currency: 'GNF',
  pickupAreaId: null,
  availableFrom: '2026-10-01',
  availableTo: null,
});

describe('createOffer (factory — the collection invariants)', () => {
  it('registers when the seller is active and the product declares the unit', async () => {
    const result = await createOffer(baseInput(), deps(), makePorts());
    expect(result.ok).toBe(true);
  });

  it('refuses an inactive seller (invariant 2)', async () => {
    const result = await createOffer(
      baseInput(),
      deps(),
      makePorts({ active: false }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.rule).toBe(TradeRule.SELLER_NOT_ACTIVE);
  });

  it('refuses a product the catalog does not publish (invariant 3)', async () => {
    const ports = makePorts();
    ports.catalog.getPublishedProduct = async () => null;
    const result = await createOffer(baseInput(), deps(), ports);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.rule).toBe(TradeRule.PRODUCT_NOT_PUBLISHED);
  });

  it('refuses a unit the product does not declare (invariant 5)', async () => {
    const result = await createOffer(
      { ...baseInput(), unitCode: 'L' },
      deps(),
      makePorts({ units: ['KG', 'SAC_50'] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.rule).toBe(TradeRule.UNIT_NOT_DECLARED);
  });

  it('propagates value-object failures — a bad price never reaches register', async () => {
    const result = await createOffer(
      { ...baseInput(), priceAmountMinor: 0 },
      deps(),
      makePorts(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.rule).toBe(TradeRule.INVALID_PRICE);
  });
});
