import type { Result } from '@nafa/shared';
import type { ProductCode } from '../product-code.vo';
import type { ProductId } from '../product-id.vo';
import type { ProductRuleViolation } from '../products.errors';

/**
 * Whether a product code is still free.
 *
 * Uniqueness spans the whole catalogue — no single aggregate can see its
 * siblings — so the check has to be asked of something that can. This is
 * the reason invariant 2 (code unique globally, ADR-0010 §3) lives
 * outside the Product aggregate.
 *
 * An interface plus a token, deliberately: the shape of "the collection"
 * is an adapter decision; naming it here would make the port abstract
 * nothing.
 */
export interface ProductCodeUniquenessChecker {
  /**
   * Refuses a code already taken.
   *
   * @param excluding the product being updated, so it does not collide
   *   with itself — omit when registering a new one.
   */
  check(
    code: ProductCode,
    excluding?: ProductId,
  ): Promise<Result<void, ProductRuleViolation>>;
}

/** Framework-neutral injection token, bound by the adapter side. */
export const PRODUCT_CODE_UNIQUENESS_CHECKER = Symbol(
  'PRODUCT_CODE_UNIQUENESS_CHECKER',
);
