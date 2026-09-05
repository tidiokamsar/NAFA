import { type Brand, err, ok, type Result } from '@nafa/shared';
import { ProductRule, ProductRuleViolation } from './products.errors';

/**
 * The short, stable, human-typable code of a product — `RIZ`, `ANACARDE`,
 * `FONIO`.
 *
 * Global by design (ADR-0010 §3): the cashew is the cashew everywhere,
 * unlike an area code which is scoped per country. Uniqueness spans the
 * whole catalogue and is therefore checked against the collection
 * (invariant 2), not by this VO — this VO checks the shape only.
 */
export type ProductCode = Brand<string, 'ProductCode'>;

const CODE = /^[A-Z0-9_]{2,12}$/;

/**
 * Validates and brands a product code.
 *
 * Uppercases the input first — `riz` and `RIZ` are the same code.
 */
export function productCode(
  raw: string,
): Result<ProductCode, ProductRuleViolation> {
  const candidate = raw.trim().toUpperCase();

  if (!CODE.test(candidate)) {
    return err(
      ProductRuleViolation.invalid(
        ProductRule.INVALID_PRODUCT_CODE,
        `Product code must be 2-12 characters of A-Z, 0-9 or _; got "${raw}".`,
      ),
    );
  }

  return ok(candidate as ProductCode);
}
