import type { Clock, IdGenerator } from '@nafa/shared';
import { err, ok, type Result } from '@nafa/shared';
import { AdministrativeLevel } from '../../../country-profile/domain/administrative-level.vo';
import { CountryProfileStatus } from '../../../country-profile/domain/country-profile-status.vo';
import {
  GeographyRule,
  GeographyRuleViolation,
} from '../../../country-profile/domain/country-profile.errors';
import type { CountryProfile } from '../../../country-profile/domain/country-profile.aggregate';
import {
  administrativeAreaId,
  type AdministrativeAreaId,
} from '../administrative-area-id.vo';
import { areaCode } from '../area-code.vo';
import { areaName } from '../area-name.vo';
import { geoPoint, type GeoPoint } from '../geo-point.vo';
import { validityPeriod } from '../validity-period.vo';
import {
  AdministrativeArea,
  validateParentChildLevels,
  validateLevelDeclaredInProfile,
} from '../administrative-area.aggregate';

// ---------------------------------------------------------------------------
// Convenience: build inputs without manual VO wrapping
// ---------------------------------------------------------------------------

export interface AreaInput {
  readonly areaId: string;
  readonly level: AdministrativeLevel;
  readonly code: string;
  readonly officialName: string;
  readonly aliases?: readonly string[];
  readonly parentId: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly startDate: string;
  readonly endDate?: string | null;
}

export interface ParentInfo {
  readonly parentId: AdministrativeAreaId;
  readonly parentLevel: AdministrativeLevel;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an `AdministrativeArea` from plain inputs, validating against
 * the given `CountryProfile`.
 *
 * The profile is **passed in**, never fetched — same precedent as
 * `CooperativeMembership.admit()` receiving natures.
 *
 * Invariants enforced here (those the aggregate cannot check alone):
 *  11. Level is declared in the country's profile
 *  12. Country profile is PUBLISHED
 *  9.  Parent is exactly one level above
 *
 * Invariant 13 (code uniqueness) is checked externally by the use case
 * via a repository query.
 */
export function createAdministrativeArea(input: {
  readonly area: AreaInput;
  readonly profile: CountryProfile;
  readonly parentInfo: ParentInfo | null;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}) {
  const { area, profile, parentInfo, clock, ids } = input;

  // Invariant 12: profile must be PUBLISHED
  if (profile.status !== CountryProfileStatus.PUBLISHED) {
    return err(
      GeographyRuleViolation.violated(
        GeographyRule.PROFILE_NOT_PUBLISHED,
        'Can only register areas under a PUBLISHED country profile.',
      ),
    );
  }

  // Validate VOs
  const idResult = administrativeAreaId(area.areaId);
  if (!idResult.ok) return idResult;

  const codeResult = areaCode(area.code);
  if (!codeResult.ok) return codeResult;

  const nameResult = areaName(
    { official: area.officialName, aliases: area.aliases },
    area.officialName,
  );
  if (!nameResult.ok) return nameResult;

  const centroidResult = buildCentroid(area.latitude, area.longitude);
  if (!centroidResult.ok) return centroidResult;

  const validityResult = validityPeriod({
    startDate: area.startDate,
    endDate: area.endDate,
  });
  if (!validityResult.ok) return validityResult;

  // Invariant 11: level must be declared in profile
  const levelCheck = validateLevelDeclaredInProfile(area.level, profile.levels);
  if (!levelCheck.ok) return levelCheck;

  // Invariant 9: parent level must be exactly one rank above
  // Invariant 10: COUNTRY-level areas must not have a parent
  if (parentInfo !== null) {
    if (area.level === AdministrativeLevel.COUNTRY) {
      return err(
        GeographyRuleViolation.violated(
          GeographyRule.ROOT_CANNOT_HAVE_PARENT,
          'A COUNTRY-level area cannot have a parent.',
        ),
      );
    }

    const parentCheck = validateParentChildLevels(
      parentInfo.parentLevel,
      area.level,
    );
    if (!parentCheck.ok) return parentCheck;
  }

  return AdministrativeArea.register(
    {
      areaId: idResult.value,
      countryCode: profile.countryCode,
      level: area.level,
      code: codeResult.value,
      name: nameResult.value,
      parentId: parentInfo?.parentId ?? null,
      centroid: centroidResult.value,
      validity: validityResult.value,
    },
    { clock, ids },
  );
}

// ---------------------------------------------------------------------------
// Helpers (module-private)
// ---------------------------------------------------------------------------

function buildCentroid(
  latitude: number | null,
  longitude: number | null,
): Result<GeoPoint | null, GeographyRuleViolation> {
  if (latitude === null || longitude === null) {
    return ok(null);
  }

  return geoPoint({ latitude, longitude });
}
