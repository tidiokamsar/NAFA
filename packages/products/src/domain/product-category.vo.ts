import { err, ok, type Result } from '@nafa/shared';
import { ProductRule, ProductRuleViolation } from './products.errors';

/**
 * The generic taxonomy of tradeable products (ADR-0010 §2).
 *
 * Generic on purpose, the same way geography's levels are generic
 * (ADR-0009): a Guinean filière enum would not survive the first Malian
 * actor, and NAFA targets seven countries. Local filières are aliases of
 * a product, never categories.
 */
export enum ProductCategory {
  /** Riz, maïs, fonio, sorgho, mil… */
  CEREAL = 'CEREAL',
  /** Manioc, igname, patate douce… */
  TUBER = 'TUBER',
  /** Anacarde, café, cacao, palmiste, sésame, coton… */
  CASH_CROP = 'CASH_CROP',
  /** Fruits et légumes frais. */
  HORTICULTURE = 'HORTICULTURE',
  /** Bétail et volaille. */
  LIVESTOCK = 'LIVESTOCK',
  /** Pêche. */
  FISHERY = 'FISHERY',
  /** Produits transformés — huile, farine, beurre de karité… */
  PROCESSED = 'PROCESSED',
}

export const PRODUCT_CATEGORIES: readonly ProductCategory[] =
  Object.values(ProductCategory);

/**
 * Parses a category from its wire representation.
 *
 * Unknown values are refused (invariant 3) rather than coerced — a typo
 * in a category must surface at the boundary, not corrupt the catalogue.
 */
export function productCategory(
  raw: string,
): Result<ProductCategory, ProductRuleViolation> {
  const candidate = PRODUCT_CATEGORIES.find((c) => c === raw.toUpperCase());
  if (!candidate) {
    return err(
      ProductRuleViolation.invalid(
        ProductRule.INVALID_CATEGORY,
        `"${raw}" is not a product category. Use one of: ${PRODUCT_CATEGORIES.join(', ')}.`,
      ),
    );
  }
  return ok(candidate);
}
