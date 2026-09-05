import type { ActorId } from '@nafa/foundation';
import type { ProductId } from '@nafa/products';
import type { Offer } from '../offer.aggregate';
import {
  type OfferRepository,
  OFFER_REPOSITORY,
  type ProductCatalog,
  PRODUCT_CATALOG,
  type SellerRegistry,
  SELLER_REGISTRY,
} from './index';

const SELLER = '660e8400-e29b-41d4-a716-446655440001' as ActorId;
const PRODUCT = '770e8400-e29b-41d4-a716-446655440002' as ProductId;

// ---------------------------------------------------------------------------
// Contract tests — no implementation exists yet. A test double satisfying
// each interface is the cheapest proof that the shape compiles, and that
// save(offer, expectedVersion) carries the arity shared by every Master.
// ---------------------------------------------------------------------------

describe('OfferRepository contract', () => {
  it('is implemented by a minimal test double', async () => {
    const repo: OfferRepository = {
      async findById() {
        return null;
      },
      async findBySeller() {
        return [];
      },
      async findByProduct() {
        return [];
      },
      async findByPickupArea() {
        return [];
      },
      async save() {
        // test double — no-op
      },
    };

    await expect(repo.save({} as Offer, 0)).resolves.toBeUndefined();
    expect(repo.findBySeller).toBeInstanceOf(Function);
    expect(repo.findByProduct).toBeInstanceOf(Function);
    expect(repo.findByPickupArea).toBeInstanceOf(Function);
  });

  it('save takes (offer, expectedVersion) — arity parity with every Master', () => {
    const save: Pick<
      OfferRepository,
      'save'
    >['save'] = async (): Promise<void> => {};

    const fn: (o: Offer, v: number) => Promise<void> = save;
    expect(fn).toBe(save);
  });

  it('declares Symbol tokens distinct from each other', () => {
    expect(typeof OFFER_REPOSITORY).toBe('symbol');
    expect(typeof PRODUCT_CATALOG).toBe('symbol');
    expect(typeof SELLER_REGISTRY).toBe('symbol');
    expect(
      new Set([OFFER_REPOSITORY, PRODUCT_CATALOG, SELLER_REGISTRY]).size,
    ).toBe(3);
  });
});

describe('ProductCatalog contract', () => {
  it('is implemented by a minimal test double', async () => {
    const catalog: ProductCatalog = {
      async getPublishedProduct(productId) {
        return { productId, units: ['KG' as never] };
      },
    };

    const product = await catalog.getPublishedProduct(PRODUCT);
    expect(product?.units).toEqual(['KG']);
  });
});

describe('SellerRegistry contract', () => {
  it('is implemented by a minimal test double', async () => {
    const registry: SellerRegistry = {
      async isActive(sellerId) {
        return sellerId === SELLER;
      },
    };

    expect(await registry.isActive(SELLER)).toBe(true);
    expect(
      await registry.isActive(
        '990e8400-e29b-41d4-a716-446655440004' as ActorId,
      ),
    ).toBe(false);
  });
});
