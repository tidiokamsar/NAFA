import { type Brand, err, ok, type Result } from '@nafa/shared';
import { ProductRule, ProductRuleViolation } from './products.errors';

/**
 * The identity of a product in the reference catalogue.
 *
 * Branded so a raw string — or worse, another aggregate's id — cannot be
 * passed where a product id is expected.
 */
export type ProductId = Brand<string, 'ProductId'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates and brands a product id.
 *
 * Accepts any UUID casing, canonicalises to lowercase — two spellings of
 * the same id must compare equal.
 */
export function productId(
  raw: string,
): Result<ProductId, ProductRuleViolation> {
  const candidate = raw.trim().toLowerCase();

  if (!UUID.test(candidate)) {
    return err(
      ProductRuleViolation.invalid(
        ProductRule.INVALID_PRODUCT_ID,
        `Product id must be a UUID; got "${raw}".`,
      ),
    );
  }

  return ok(candidate as ProductId);
}
