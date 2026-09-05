import { type Brand, err, ok, type Result } from '@nafa/shared';
import {
  type AdministrativeLevel as AdministrativeLevelType,
  REGISTERABLE_LEVELS,
} from './administrative-level.vo';
import {
  GeographyRule,
  GeographyRuleViolation,
} from './country-profile.errors';

// ---------------------------------------------------------------------------
// LevelLabel — singular and plural display names for one level
// ---------------------------------------------------------------------------

export interface LevelLabel {
  readonly singular: string;
  readonly plural: string;
}

export function levelLabel(
  input: { singular: string; plural: string },
  level: AdministrativeLevelType,
): Result<LevelLabel, GeographyRuleViolation> {
  const singular = input.singular.trim();
  const plural = input.plural.trim();

  if (!singular) {
    return err(
      GeographyRuleViolation.invalid(
        GeographyRule.INVALID_LABEL,
        `Singular label for ${level} must not be empty.`,
      ),
    );
  }
  if (!plural) {
    return err(
      GeographyRuleViolation.invalid(
        GeographyRule.INVALID_LABEL,
        `Plural label for ${level} must not be empty.`,
      ),
    );
  }

  return ok({ singular, plural });
}

// ---------------------------------------------------------------------------
// LevelDefinition — one entry in a CountryProfile's level list
// ---------------------------------------------------------------------------

/**
 * A branded rank so two different levels cannot be swapped by mistake.
 * Wraps the numeric rank from `levelRank()`.
 */
export type LevelRank = Brand<number, 'LevelRank'>;

export interface LevelDefinition {
  readonly level: AdministrativeLevelType;
  readonly label: LevelLabel;
}

/**
 * Builds a level definition after validation.
 *
 * The level must be a registerable level (LEVEL_1..4, not COUNTRY).
 */
export function levelDefinition(input: {
  level: AdministrativeLevelType;
  label: LevelLabel;
}): Result<LevelDefinition, GeographyRuleViolation> {
  if (!REGISTERABLE_LEVELS.includes(input.level)) {
    return err(
      GeographyRuleViolation.invalid(
        GeographyRule.INVALID_LEVEL,
        `${input.level} is not a registerable level. Use LEVEL_1..LEVEL_4.`,
      ),
    );
  }

  return ok({ level: input.level, label: input.label });
}
