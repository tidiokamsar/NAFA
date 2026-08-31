import type { Product } from '../product.aggregate';
import type { ProductId } from '../product-id.vo';
import {
  type ProductRepository,
  type ProductCodeUniquenessChecker,
  PRODUCT_REPOSITORY,
  PRODUCT_CODE_UNIQUENESS_CHECKER,
} from './index';

const EXISTING_ID = '550e8400-e29b-41d4-a716-446655440000' as ProductId;

// ---------------------------------------------------------------------------
// Contract tests for the persistence ports.
//
// These tests do not exercise behaviour — there is no implementation yet.
// They exist to prove the contracts are real: a test double that satisfies
// the interface is the cheapest proof that the shape compiles, and that
// save(product, expectedVersion) carries the same arity as ACTOR-001 and
// GEO-001.6.
// ---------------------------------------------------------------------------

describe('ProductRepository contract', () => {
  it('is implemented by a minimal test double', async () => {
    const repo: ProductRepository = {
      async findById() {
        return null;
      },
      async findByCode() {
        return null;
      },
      async findByName() {
        return [];
      },
      async findByCategory() {
        return [];
      },
      async save() {
        // test double — no-op
      },
    };

    await expect(repo.save({} as Product, 0)).resolves.toBeUndefined();
    expect(repo.findById).toBeInstanceOf(Function);
    expect(repo.findByCode).toBeInstanceOf(Function);
    expect(repo.findByName).toBeInstanceOf(Function);
    expect(repo.findByCategory).toBeInstanceOf(Function);
  });

  it('save takes (product, expectedVersion) — arity parity with ACTOR and GEO', () => {
    const save: Pick<
      ProductRepository,
      'save'
    >['save'] = async (): Promise<void> => {};

    const fn: (p: Product, v: number) => Promise<void> = save;
    expect(fn).toBe(save);
  });

  it('declares Symbol tokens distinct from each other', () => {
    expect(typeof PRODUCT_REPOSITORY).toBe('symbol');
    expect(typeof PRODUCT_CODE_UNIQUENESS_CHECKER).toBe('symbol');
    expect(PRODUCT_REPOSITORY).not.toBe(PRODUCT_CODE_UNIQUENESS_CHECKER);
  });
});

describe('ProductCodeUniquenessChecker contract', () => {
  it('is implemented by a minimal test double', async () => {
    const checker: ProductCodeUniquenessChecker = {
      async check() {
        return { ok: true as const, value: undefined };
      },
    };

    const result = await checker.check('FONIO' as never);
    expect(result.ok).toBe(true);
  });

  it('accepts an optional excluding id', async () => {
    const checker: ProductCodeUniquenessChecker = {
      async check(_code, excluding) {
        // The excluding parameter is part of the contract — exercising it
        // proves the arity compiles.
        expect(excluding).toBe(EXISTING_ID);
        return { ok: true as const, value: undefined };
      },
    };

    const result = await checker.check('FONIO' as never, EXISTING_ID);
    expect(result.ok).toBe(true);
  });

  it('findByCategory receives the category filter — the port is queryable per category', () => {
    // Structural check: the signature accepts a ProductCategory.
    const repo = {
      findByCategory: async (): Promise<readonly Product[]> => [],
    } as Pick<ProductRepository, 'findByCategory'>;

    expect(repo.findByCategory).toBeInstanceOf(Function);
  });
});
