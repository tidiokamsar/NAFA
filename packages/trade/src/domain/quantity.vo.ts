import { err, ok, type Result } from '@nafa/shared';
import type { UnitCode } from '@nafa/products';
import { TradeRule, TradeRuleViolation } from './trade.errors';

/**
 * How much of the product the offer sells, in one of the product's
 * declared units (ADR-0011 §3).
 *
 * Decimal-friendly: West African markets trade fractional bags and half
 * loads; an integer-only quantity would lie about the trade.
 */
export interface Quantity {
  readonly value: number;
  readonly unit: UnitCode;
}

/**
 * Builds a validated quantity.
 *
 * Invariant 4: strictly positive and finite. Whether the unit is one the
 * product declares is a collection question (invariant 5) — asked through
 * the ProductCatalog port, not checked here.
 */
export function quantity(
  value: number,
  unit: UnitCode,
): Result<Quantity, TradeRuleViolation> {
  if (!Number.isFinite(value) || value <= 0) {
    return err(
      TradeRuleViolation.invalid(
        TradeRule.INVALID_QUANTITY,
        `Quantity must be a strictly positive finite number; got ${value}.`,
      ),
    );
  }

  return ok({ value, unit });
}
