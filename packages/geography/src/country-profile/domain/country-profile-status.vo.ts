import { ok, err, type Result } from '@nafa/shared';
import {
  GeographyRule,
  GeographyRuleViolation,
} from './country-profile.errors';

/**
 * Lifecycle of a CountryProfile.
 *
 * DRAFT → PUBLISHED → DEPRECATED.
 * DEPRECATED is terminal.
 */
export enum CountryProfileStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  DEPRECATED = 'DEPRECATED',
}

const ALLOWED_TRANSITIONS: ReadonlyMap<
  CountryProfileStatus,
  readonly CountryProfileStatus[]
> = new Map([
  [CountryProfileStatus.DRAFT, [CountryProfileStatus.PUBLISHED]],
  [CountryProfileStatus.PUBLISHED, [CountryProfileStatus.DEPRECATED]],
  // DEPRECATED — no outgoing edges, terminal.
]);

/**
 * Checks whether a transition is allowed.
 *
 * Returns `ok(undefined)` for a valid transition, `err(...)` otherwise.
 * Staying on the same status is also refused — it would produce a no-op event.
 */
export function checkCountryProfileTransition(
  from: CountryProfileStatus,
  to: CountryProfileStatus,
): Result<void, GeographyRuleViolation> {
  if (from === to) {
    return err(
      GeographyRuleViolation.transition(
        GeographyRule.INVALID_STATUS_TRANSITION,
        `Profile is already ${from}.`,
      ),
    );
  }

  const targets = ALLOWED_TRANSITIONS.get(from);
  if (!targets || !targets.includes(to)) {
    return err(
      GeographyRuleViolation.transition(
        GeographyRule.INVALID_STATUS_TRANSITION,
        `Cannot transition from ${from} to ${to}.`,
      ),
    );
  }

  return ok(undefined);
}
