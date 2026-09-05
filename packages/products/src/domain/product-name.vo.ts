import { err, ok, type Result } from '@nafa/shared';
import { ProductRule, ProductRuleViolation } from './products.errors';

/**
 * A product's display names: the official one, always present, plus the
 * local aliases it is traded under — « Anacarde », « Cajou », « Cashew »
 * are the same merchandise in three markets (ADR-0010 §4).
 */
export interface ProductName {
  readonly official: string;
  readonly aliases: readonly string[];
}

function clean(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Builds a validated product name.
 *
 * Invariant 4: the official name is non-empty; every alias is non-empty;
 * aliases are deduplicated (two spellings differing only by casing or
 * whitespace are one alias).
 */
export function productName(input: {
  official: string;
  aliases?: readonly string[];
}): Result<ProductName, ProductRuleViolation> {
  const official = clean(input.official);

  if (official.length === 0) {
    return err(
      ProductRuleViolation.invalid(
        ProductRule.INVALID_PRODUCT_NAME,
        'The official name must not be empty.',
      ),
    );
  }

  const seen = new Set<string>();
  const aliases: string[] = [];

  for (const rawAlias of input.aliases ?? []) {
    const alias = clean(rawAlias);
    if (alias.length === 0) {
      return err(
        ProductRuleViolation.invalid(
          ProductRule.INVALID_PRODUCT_NAME,
          'An alias must not be empty.',
        ),
      );
    }
    // Case-insensitive dedup — "Cajou" and "cajou" are one alias.
    const key = alias.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      aliases.push(alias);
    }
  }

  return ok({ official, aliases });
}
