import { type Brand, err, ok, type Result } from '@nafa/shared';
import { TradeRule, TradeRuleViolation } from './trade.errors';

/** An ISO 4217 currency code — GNF, XOF, USD… */
export type Currency = Brand<string, 'Currency'>;

/**
 * An amount of money in the currency's minor unit — the asking price of
 * one unit of the offer's product (ADR-0011 §2).
 *
 * Minor units keep the domain off floating point: GNF and XOF have no
 * subdivision in practice, but the type stays generic — seven countries,
 * several currencies. The asking price is what the seller proposes; the
 * market cotation is the Pricing Engine's, never this.
 */
export interface Money {
  readonly amountMinor: number;
  readonly currency: Currency;
}

const CURRENCY = /^[A-Z]{3}$/;

/**
 * Builds a validated price.
 *
 * Invariant 6: amountMinor is a strictly positive integer (a free offer is
 * not an offer), currency is a 3-letter ISO 4217 code.
 */
export function money(
  amountMinor: number,
  rawCurrency: string,
): Result<Money, TradeRuleViolation> {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    return err(
      TradeRuleViolation.invalid(
        TradeRule.INVALID_PRICE,
        `Price must be a strictly positive integer of minor units; got ${amountMinor}.`,
      ),
    );
  }

  const currency = rawCurrency.trim().toUpperCase();
  if (!CURRENCY.test(currency)) {
    return err(
      TradeRuleViolation.invalid(
        TradeRule.INVALID_PRICE,
        `Currency must be a 3-letter ISO 4217 code; got "${rawCurrency}".`,
      ),
    );
  }

  return ok({ amountMinor, currency: currency as Currency });
}
