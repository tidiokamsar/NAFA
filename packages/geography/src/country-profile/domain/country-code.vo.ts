import { type Brand, err, ok, type Result } from '@nafa/shared';
import {
  GeographyRule,
  GeographyRuleViolation,
} from './country-profile.errors';

/**
 * ISO 3166-1 alpha-2 country code, e.g. `GN`, `ML`, `LR`.
 *
 * Branded so it cannot be confused with any other two-letter string.
 */
export type CountryCode = Brand<string, 'CountryCode'>;

const ALPHA2 = /^[A-Z]{2}$/;

/**
 * Validates and brands a country code.
 *
 * Checks the shape only; a full ISO 3166-1 lookup would require a data file
 * that does not belong in the domain layer. The import pipeline is
 * responsible for feeding real codes.
 */
export function countryCode(
  raw: string,
): Result<CountryCode, GeographyRuleViolation> {
  const candidate = raw.trim().toUpperCase();

  if (!ALPHA2.test(candidate)) {
    return err(
      GeographyRuleViolation.invalid(
        GeographyRule.INVALID_COUNTRY_CODE,
        `Country code must be exactly two ASCII letters (ISO 3166-1 alpha-2); got "${raw}".`,
      ),
    );
  }

  return ok(candidate as CountryCode);
}
