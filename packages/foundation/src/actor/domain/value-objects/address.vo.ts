import { err, ok, type Result } from '@nafa/shared';
import type { AdministrativeAreaId } from '@nafa/geography';
import { ActorRule, ActorRuleViolation } from '../actor.errors';

/**
 * A postal address, kept to what identity verification needs and no more.
 *
 * No coordinates: where a warehouse is on a map is a logistics concern, and
 * putting a point here would pull operational data into the actor record.
 *
 * `region` is a free string on purpose, and it is the known migration point
 * of this context: once the geography master exists it becomes a reference to
 * an administrative area. GEO-001.7 makes that reference *possible* by adding
 * the optional `areaId` — no existing actor is invalidated, and no automatic
 * resolution happens yet. `region` stays until the import pipeline has run
 * and every actor has been assigned an `areaId`; then it retires (phase 3/4).
 */
export interface Address {
  readonly line: string;
  readonly locality: string;
  readonly region: string;
  /**
   * Reference to the administrative area this address sits in, when known.
   *
   * Optional on purpose (GEO-001.7 phase 1): the geography master is empty
   * until the import pipeline runs, so making it required would invalidate
   * every existing actor. Callers that have resolved an area set it; callers
   * that have not leave it unset and fall back to `region`.
   */
  readonly areaId?: AdministrativeAreaId;
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
  /** Optional anchor to a resolved administrative area (GEO-001.7 phase 1). */
  areaId?: AdministrativeAreaId;
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

  // `areaId` passes through unchecked: it is a branded type whose shape was
  // validated at its construction in the geography master, so re-validating
  // it here would duplicate work and couple this VO to geography's rules.
  return ok(
    input.areaId !== undefined
      ? { line, locality, region, areaId: input.areaId, countryCode }
      : { line, locality, region, countryCode },
  );
}
