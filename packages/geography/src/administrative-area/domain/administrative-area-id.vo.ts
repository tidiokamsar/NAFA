import { Brand, err, ok, type Result } from '@nafa/shared';
import {
  GeographyRule,
  GeographyRuleViolation,
} from '../../country-profile/domain/country-profile.errors';

/** Nominal identifier for an administrative area. */
export type AdministrativeAreaId = Brand<string, 'AdministrativeAreaId'>;

/**
 * Validates and brands a raw string as an AdministrativeAreaId.
 *
 * Accepts any RFC 4122 UUID — generation is an infrastructure concern
 * (database or IdGenerator), not a domain one.
 */
export function administrativeAreaId(
  raw: string,
): Result<AdministrativeAreaId, GeographyRuleViolation> {
  const trimmed = raw.trim();
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(trimmed)) {
    return err(
      GeographyRuleViolation.invalid(
        GeographyRule.INVALID_AREA_ID,
        `Administrative area id must be a valid UUID; got "${trimmed}".`,
      ),
    );
  }

  return ok(trimmed as AdministrativeAreaId);
}
