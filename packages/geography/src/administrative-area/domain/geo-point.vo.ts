import { err, ok, type Result } from '@nafa/shared';
import {
  GeographyRule,
  GeographyRuleViolation,
} from '../../country-profile/domain/country-profile.errors';

/**
 * A geographic point (centroid of an administrative area).
 *
 * ADR-0009 §7: polygons are deferred; only centroid is stored initially.
 */
export interface GeoPoint {
  /** Latitude in decimal degrees, [-90, 90]. */
  readonly latitude: number;
  /** Longitude in decimal degrees, [-180, 180]. */
  readonly longitude: number;
}

/**
 * Validates and constructs a GeoPoint.
 *
 * Invariant 17: coordinates must be in valid geographic ranges.
 */
export function geoPoint(input: {
  readonly latitude: number;
  readonly longitude: number;
}): Result<GeoPoint, GeographyRuleViolation> {
  const { latitude, longitude } = input;

  if (latitude < -90 || latitude > 90) {
    return err(
      GeographyRuleViolation.invalid(
        GeographyRule.INVALID_CENTROID,
        `Latitude must be between -90 and 90; got ${latitude}.`,
      ),
    );
  }

  if (longitude < -180 || longitude > 180) {
    return err(
      GeographyRuleViolation.invalid(
        GeographyRule.INVALID_CENTROID,
        `Longitude must be between -180 and 180; got ${longitude}.`,
      ),
    );
  }

  return ok({ latitude, longitude });
}
