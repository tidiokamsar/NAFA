import { err, isoDate, ok, type Result, type IsoDate } from '@nafa/shared';
import { TradeRule, TradeRuleViolation } from './trade.errors';

/**
 * When the offered goods are available — harvest timing, not a listing
 * deadline.
 *
 * `availableTo` is open-ended when null: some offers stay up until
 * withdrawn.
 */
export interface OfferWindow {
  readonly availableFrom: IsoDate;
  readonly availableTo: IsoDate | null;
}

/**
 * Builds a validated availability window.
 *
 * Invariant 7: both dates are ISO dates (YYYY-MM-DD, validated by the
 * shared kernel's isoDate) and the window is coherent — availableTo, when
 * present, is not before availableFrom.
 */
export function offerWindow(input: {
  availableFrom: string;
  availableTo?: string | null;
}): Result<OfferWindow, TradeRuleViolation> {
  // Shape validation delegated to the shared kernel; its ValidationError is
  // re-wrapped into the trade's violation type.
  const from = isoDate(input.availableFrom, 'availableFrom');
  if (!from.ok) {
    return err(
      TradeRuleViolation.invalid(TradeRule.INVALID_WINDOW, from.error.message),
    );
  }

  let to: IsoDate | null = null;
  if (input.availableTo !== undefined && input.availableTo !== null) {
    const parsed = isoDate(input.availableTo, 'availableTo');
    if (!parsed.ok) {
      return err(
        TradeRuleViolation.invalid(
          TradeRule.INVALID_WINDOW,
          parsed.error.message,
        ),
      );
    }
    to = parsed.value;
  }

  if (to !== null && to < from.value) {
    return err(
      TradeRuleViolation.invalid(
        TradeRule.INVALID_WINDOW,
        'availableTo cannot be before availableFrom.',
      ),
    );
  }

  return ok({ availableFrom: from.value, availableTo: to });
}
