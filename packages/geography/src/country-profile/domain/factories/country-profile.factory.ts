import type { Clock, IdGenerator } from '@nafa/shared';
import type { AdministrativeLevel } from '../administrative-level.vo';
import { levelLabel, levelDefinition } from '../level-definition.vo';
import type { LevelDefinition } from '../level-definition.vo';
import { countryCode } from '../country-code.vo';
import { CountryProfile } from '../country-profile.aggregate';

// ---------------------------------------------------------------------------
// Convenience: build LevelDefinition without manual VO wrapping
// ---------------------------------------------------------------------------

export interface LevelInput {
  readonly level: AdministrativeLevel;
  readonly singular: string;
  readonly plural: string;
}

/**
 * Builds a `CountryProfile` from plain inputs.
 *
 * This is the convenience entry point for use cases.  The aggregate's own
 * `register()` expects pre-validated VOs; the factory validates them first
 * so the use case does not have to.
 */
export function createCountryProfile(input: {
  readonly countryCode: string;
  readonly levels: readonly LevelInput[];
  readonly clock: Clock;
  readonly ids: IdGenerator;
}) {
  // 1. Validate country code
  const code = countryCode(input.countryCode);
  if (!code.ok) return code;

  // 2. Validate each level's label, then build LevelDefinition
  const validatedLevels: LevelDefinition[] = [];
  for (const lvl of input.levels) {
    const label = levelLabel(
      { singular: lvl.singular, plural: lvl.plural },
      lvl.level,
    );
    if (!label.ok) return label;

    const def = levelDefinition({ level: lvl.level, label: label.value });
    if (!def.ok) return def;

    validatedLevels.push(def.value);
  }

  // 3. Register through the aggregate
  return CountryProfile.register(
    {
      countryCode: code.value,
      levels: validatedLevels,
    },
    { clock: input.clock, ids: input.ids },
  );
}
