import { Brand, err, ok, type Result } from '@nafa/shared';
import {
  GeographyRule,
  GeographyRuleViolation,
} from '../../country-profile/domain/country-profile.errors';

/**
 * An external code assigned to an administrative area (e.g. INSEE, ISO 3166-2,
 * national coding system).
 *
 * Branded to prevent accidental mixing with raw strings.
 */
export type AreaCode = Brand<string, 'AreaCode'>;

/** Max length for an area code. */
const AREA_CODE_MAX_LENGTH = 50;

/**
 * Validates and brands a raw string as an AreaCode.
 *
 * Rules: non-empty after trim, max 50 characters, printable ASCII.
 */
export function areaCode(
  raw: string,
): Result<AreaCode, GeographyRuleViolation> {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return err(
      GeographyRuleViolation.invalid(
        GeographyRule.INVALID_AREA_CODE,
        'Area code must not be empty.',
      ),
    );
  }

  if (trimmed.length > AREA_CODE_MAX_LENGTH) {
    return err(
      GeographyRuleViolation.invalid(
        GeographyRule.INVALID_AREA_CODE,
        `Area code must not exceed ${AREA_CODE_MAX_LENGTH} characters.`,
      ),
    );
  }

  // Printable ASCII (no control characters)
  if (!/^[\x20-\x7E]+$/.test(trimmed)) {
    return err(
      GeographyRuleViolation.invalid(
        GeographyRule.INVALID_AREA_CODE,
        'Area code must contain only printable ASCII characters.',
      ),
    );
  }

  return ok(trimmed as AreaCode);
}
