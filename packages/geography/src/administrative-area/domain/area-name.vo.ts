import { err, ok, type Result } from '@nafa/shared';
import {
  GeographyRule,
  GeographyRuleViolation,
} from '../../country-profile/domain/country-profile.errors';

/** The official name and optional local aliases of an administrative area. */
export interface AreaName {
  /** Official name — always present, non-empty. */
  readonly official: string;
  /** Alternative local names (variant spellings, colloquial names). */
  readonly aliases: readonly string[];
}

/**
 * Validates and constructs an AreaName.
 *
 * Invariant 14: official name must be non-empty after trim.
 * Invariant 15: every alias must be non-empty after trim.
 */
export function areaName(
  input: { readonly official: string; readonly aliases?: readonly string[] },
  fieldLabel = 'Area name',
): Result<AreaName, GeographyRuleViolation> {
  const official = input.official.trim();

  // Invariant 14
  if (official.length === 0) {
    return err(
      GeographyRuleViolation.invalid(
        GeographyRule.INVALID_AREA_NAME,
        `${fieldLabel} — official name must not be empty.`,
      ),
    );
  }

  // Invariant 15
  const aliases: string[] = [];
  for (const raw of input.aliases ?? []) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return err(
        GeographyRuleViolation.invalid(
          GeographyRule.INVALID_AREA_NAME,
          `${fieldLabel} — aliases must not contain empty strings.`,
        ),
      );
    }
    aliases.push(trimmed);
  }

  return ok({ official, aliases });
}
