import type { IsoDate } from '../types/primitives';
import { ValidationError } from '../errors/nafa-error';
import { type Result, err, ok } from './result';

const SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a calendar date, `YYYY-MM-DD`, with no time and no zone.
 *
 * Deliberately not an ISO *date-time*: a birth date or an incorporation date is
 * a day, not an instant. Storing one as a timestamp forces a timezone choice
 * that has no meaning and shifts the date by one either side of midnight.
 *
 * Returns a `ValidationError` — not a domain-specific violation — because a
 * calendar date belongs to no Master. Each Master wraps the failure into its
 * own rule type at the call site; see `packages/foundation/.../iso-date.vo.ts`
 * for the actor-side adapter. Lifted from foundation by ADR-0009 §6 so that no
 * two Masters ever duplicate this definition.
 *
 * @param label  Human-readable name of the field, used in the error message.
 */
export function isoDate(
  raw: string,
  label: string,
): Result<IsoDate, ValidationError> {
  const candidate = raw.trim();

  if (!SHAPE.test(candidate)) {
    return err(new ValidationError(`${label} must be in YYYY-MM-DD form.`));
  }

  // Round-tripping catches what the pattern cannot: 2025-02-30 matches the
  // shape but is not a date, and Date would silently roll it to March.
  const parsed = new Date(`${candidate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return err(new ValidationError(`${label} is not a real date.`));
  }
  if (parsed.toISOString().slice(0, 10) !== candidate) {
    return err(new ValidationError(`${label} is not a real date.`));
  }

  return ok(candidate as IsoDate);
}
