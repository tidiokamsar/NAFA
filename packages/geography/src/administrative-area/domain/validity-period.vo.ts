import { type IsoDate, isoDate, err, ok, type Result } from '@nafa/shared';
import {
  GeographyRule,
  GeographyRuleViolation,
} from '../../country-profile/domain/country-profile.errors';

/**
 * The period during which an administrative area assignment is valid.
 *
 * Both dates are inclusive.  `endDate` is optional — an open-ended period
 * means the area is still current.
 */
export interface ValidityPeriod {
  readonly startDate: IsoDate;
  readonly endDate: IsoDate | null;
}

/**
 * Validates and constructs a ValidityPeriod.
 *
 * Invariant 16: start date is a valid ISO date; if endDate is present, it
 * must also be valid and >= startDate.
 */
export function validityPeriod(input: {
  readonly startDate: string;
  readonly endDate?: string | null;
}): Result<ValidityPeriod, GeographyRuleViolation> {
  const start = isoDate(input.startDate, 'Start date');
  if (!start.ok) {
    return err(
      GeographyRuleViolation.invalid(
        GeographyRule.INVALID_PERIOD,
        start.error.message,
      ),
    );
  }

  if (input.endDate != null && input.endDate.trim() !== '') {
    const end = isoDate(input.endDate, 'End date');
    if (!end.ok) {
      return err(
        GeographyRuleViolation.invalid(
          GeographyRule.INVALID_PERIOD,
          end.error.message,
        ),
      );
    }

    if (end.value < start.value) {
      return err(
        GeographyRuleViolation.invalid(
          GeographyRule.INVALID_PERIOD,
          'End date must be on or after start date.',
        ),
      );
    }

    return ok({ startDate: start.value, endDate: end.value });
  }

  return ok({ startDate: start.value, endDate: null });
}
