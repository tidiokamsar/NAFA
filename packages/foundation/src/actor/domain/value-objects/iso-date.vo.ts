import { type Brand, err, ok, type Result } from '@nafa/shared';
import { type ActorRule, ActorRuleViolation } from '../actor.errors';

/**
 * A calendar date, `YYYY-MM-DD`, with no time and no zone.
 *
 * Deliberately not `IsoDateTime`: a birth date or an incorporation date is a
 * day, not an instant. Storing one as a timestamp forces a timezone choice
 * that has no meaning and shifts the date by one either side of midnight.
 */
export type IsoDate = Brand<string, 'IsoDate'>;

const SHAPE = /^\d{4}-\d{2}-\d{2}$/;

export function isoDate(
  raw: string,
  rule: ActorRule,
  label: string,
): Result<IsoDate, ActorRuleViolation> {
  const candidate = raw.trim();

  if (!SHAPE.test(candidate)) {
    return err(
      ActorRuleViolation.invalid(rule, `${label} must be in YYYY-MM-DD form.`),
    );
  }

  // Round-tripping catches what the pattern cannot: 2025-02-30 matches the
  // shape but is not a date, and Date would silently roll it to March.
  const parsed = new Date(`${candidate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return err(
      ActorRuleViolation.invalid(rule, `${label} is not a real date.`),
    );
  }
  if (parsed.toISOString().slice(0, 10) !== candidate) {
    return err(
      ActorRuleViolation.invalid(rule, `${label} is not a real date.`),
    );
  }

  return ok(candidate as IsoDate);
}
