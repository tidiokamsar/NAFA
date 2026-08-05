import { err, ok, type Result } from '@nafa/shared';
import { ActorRule, ActorRuleViolation } from '../actor.errors';

/**
 * A postal address, kept to what identity verification needs and no more.
 *
 * No coordinates: where a warehouse is on a map is a logistics concern, and
 * putting a point here would pull operational data into the actor record.
 *
 * `region` is a free string on purpose, and it is the known migration point
 * of this context: once the geography master exists it becomes a reference to
 * an administrative area. Until then, a string that a field agent can fill
 * beats a foreign key to a table nobody has built.
 */
export interface Address {
  readonly line: string;
  readonly locality: string;
  readonly region: string;
  /** ISO 3166-1 alpha-2, uppercased. `GN` for Guinea. */
  readonly countryCode: string;
}

const COUNTRY_CODE = /^[A-Z]{2}$/;

function clean(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function address(input: {
  line: string;
  locality: string;
  region: string;
  countryCode: string;
}): Result<Address, ActorRuleViolation> {
  const line = clean(input.line);
  const locality = clean(input.locality);
  const region = clean(input.region);
  const countryCode = input.countryCode.trim().toUpperCase();

  // A street line is optional in much of NAFA's territory — many localities
  // have no named streets — but locality and region always exist.
  if (locality.length === 0 || region.length === 0) {
    return err(
      ActorRuleViolation.invalid(
        ActorRule.INVALID_ADDRESS,
        'Locality and region are required.',
      ),
    );
  }

  if (!COUNTRY_CODE.test(countryCode)) {
    return err(
      ActorRuleViolation.invalid(
        ActorRule.INVALID_ADDRESS,
        'Country must be an ISO 3166-1 alpha-2 code, e.g. GN.',
      ),
    );
  }

  return ok({ line, locality, region, countryCode });
}
