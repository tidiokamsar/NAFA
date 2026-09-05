import { type Brand, err, ok, type Result } from '@nafa/shared';
import { TradeRule, TradeRuleViolation } from './trade.errors';

/**
 * The identity of an offer.
 *
 * Branded so a raw string — or another aggregate's id — cannot be passed
 * where an offer id is expected.
 */
export type OfferId = Brand<string, 'OfferId'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates and brands an offer id.
 *
 * Lowercases first so two spellings of the same id compare equal.
 */
export function offerId(raw: string): Result<OfferId, TradeRuleViolation> {
  const candidate = raw.trim().toLowerCase();

  if (!UUID.test(candidate)) {
    return err(
      TradeRuleViolation.invalid(
        TradeRule.INVALID_OFFER_ID,
        `Offer id must be a UUID; got "${raw}".`,
      ),
    );
  }

  return ok(candidate as OfferId);
}
