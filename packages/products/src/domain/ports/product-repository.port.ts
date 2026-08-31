import type { Product } from '../product.aggregate';
import type { ProductCategory } from '../product-category.vo';
import type { ProductCode } from '../product-code.vo';
import type { ProductId } from '../product-id.vo';

/**
 * How the domain reaches products.
 *
 * An interface plus a token. Whether the rows live in Postgres, in memory
 * or behind a service call is an adapter decision; naming any of them
 * here would make the port abstract nothing.
 *
 * The lookup by name exists for one reason: names repeat across aliases
 * and spellings, so a match is a signal rather than an answer. It is the
 * question ProductResolutionService refines; the repository does not
 * score.
 */
export interface ProductRepository {
  findById(id: ProductId): Promise<Product | null>;

  /** The product carrying this code, whatever its status. */
  findByCode(code: ProductCode): Promise<Product | null>;

  /**
   * Every product whose official name or aliases match this text.
   *
   * Returns a list, never a single product — local naming varies by
   * market, so several candidates are an ordinary outcome.
   */
  findByName(name: string): Promise<readonly Product[]>;

  /** Every product of a category, deprecated ones included. */
  findByCategory(category: ProductCategory): Promise<readonly Product[]>;

  /**
   * Persists the product, refusing the write if the stored row moved.
   *
   * Same contract as ActorRepository and both geography repositories,
   * deliberately: two ports whose write signatures differ would let an
   * adapter author assume one aggregate needs concurrency control and
   * the other does not. Both do.
   *
   * Callers pass `product.expectedVersion` — the version it was loaded
   * at, not `product.version`, which has already moved by the time you
   * save. An adapter compares it in its `WHERE` clause and raises
   * `StaleVersionError` from `@nafa/shared` when no row matches. Zero
   * means the product has never been stored, so the write is an insert.
   */
  save(product: Product, expectedVersion: number): Promise<void>;
}

/** Framework-neutral injection token, bound by the adapter side. */
export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');
