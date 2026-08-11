import type { Result } from '@nafa/shared';
import type { GeographyRuleViolation } from '../../../country-profile/domain/country-profile.errors';
import type { AdministrativeAreaId } from '../administrative-area-id.vo';
import type { AreaCode } from '../area-code.vo';
import type { CountryCode } from '../../../country-profile/domain/country-code.vo';
import type { AdministrativeLevel } from '../../../country-profile/domain/administrative-level.vo';

/**
 * Whether a code is still free within its country and level.
 *
 * Uniqueness of a code spans the whole collection — no single aggregate can
 * see its siblings — so the check has to be asked of something that can. This
 * is the reason invariant "AreaCode is unique per country+level" lives outside
 * the `AdministrativeArea` aggregate.
 *
 * An interface plus a token, deliberately. The shape of "the collection"
 * (Postgres table, search index, materialised view) is an adapter decision;
 * naming it here would make the port abstract nothing.
 */
export interface AreaCodeUniquenessChecker {
  /**
   * Refuses a code already taken in the same country and level.
   *
   * @param excluding the area being updated, so it does not collide with
   *   itself — omit when registering a new one.
   */
  check(
    countryCode: CountryCode,
    level: AdministrativeLevel,
    code: AreaCode,
    excluding?: AdministrativeAreaId,
  ): Promise<Result<void, GeographyRuleViolation>>;
}

/** Framework-neutral injection token, bound by the adapter side. */
export const AREA_CODE_UNIQUENESS_CHECKER = Symbol(
  'AREA_CODE_UNIQUENESS_CHECKER',
);
