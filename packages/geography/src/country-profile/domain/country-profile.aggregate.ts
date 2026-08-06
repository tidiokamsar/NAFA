import {
  buildDomainEvent,
  type Clock,
  type DomainEvent,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@nafa/shared';
import { AdministrativeLevel, levelRank } from './administrative-level.vo';
import { type LevelDefinition } from './level-definition.vo';
import type { CountryCode } from './country-code.vo';
import {
  CountryProfileStatus,
  checkCountryProfileTransition,
} from './country-profile-status.vo';
import {
  GeographyRule,
  GeographyRuleViolation,
} from './country-profile.errors';
import {
  COUNTRY_PROFILE_AGGREGATE,
  CountryProfileEventType,
  type CountryProfileEventType as CountryProfileEventTypeValue,
} from './country-profile.events';

// ---------------------------------------------------------------------------
// Input / Snapshot
// ---------------------------------------------------------------------------

export interface RegisterCountryProfileInput {
  readonly countryCode: CountryCode;
  readonly levels: readonly LevelDefinition[];
}

/** The persisted shape a repository hands back. */
export interface CountryProfileSnapshot {
  readonly countryCode: CountryCode;
  readonly status: CountryProfileStatus;
  readonly levels: readonly LevelDefinition[];
  readonly version: number;
}

export interface CountryProfileDependencies {
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

/**
 * Declares which administrative levels exist in a country and how they are
 * called locally.
 *
 * Identified by its `CountryCode`: unlike an actor, a country is not something
 * we mint an id for.  ISO 3166-1 already assigned the identifier.
 *
 * Invariants (7):
 *  1. countryCode is a valid ISO 3166-1 alpha-2  (enforced by the VO)
 *  2. Levels are contiguous from LEVEL_1         (no gap)
 *  3. Each level declared at most once            (no duplicate)
 *  4. A PUBLISHED profile declares ≥ 1 level
 *  5. Each label has non-empty singular and plural (enforced by the VO)
 *  6. Status transitions are respected; DEPRECATED is terminal
 *  7. Removing a level that carries areas is refused (checked externally,
 *     via the `areasAtLevel` parameter on `changeLevels`)
 */
export class CountryProfile {
  private readonly pending: DomainEvent[] = [];
  private readonly loadedVersion: number;

  private constructor(
    readonly countryCode: CountryCode,
    private currentStatus: CountryProfileStatus,
    private currentLevels: LevelDefinition[],
    private currentVersion: number,
    private readonly deps: CountryProfileDependencies,
  ) {
    this.loadedVersion = currentVersion;
  }

  // ---------------------------------------------------------------- creation

  /**
   * Registers a new country profile in DRAFT.
   *
   * Private constructor ensures there is exactly one way in, and it checks
   * the contiguity and uniqueness invariants before emitting the event.
   */
  static register(
    input: RegisterCountryProfileInput,
    deps: CountryProfileDependencies,
  ): Result<CountryProfile, GeographyRuleViolation> {
    const levels = [...input.levels];

    const levelsCheck = validateLevels(levels);
    if (!levelsCheck.ok) return levelsCheck;

    const profile = new CountryProfile(
      input.countryCode,
      CountryProfileStatus.DRAFT,
      levels,
      0,
      deps,
    );

    profile.record(CountryProfileEventType.REGISTERED, {
      countryCode: input.countryCode,
      status: CountryProfileStatus.DRAFT,
      levels,
    });

    return ok(profile);
  }

  /**
   * Rebuilds a profile from storage.
   *
   * Performs no checks — the state was legal when written.
   */
  static rehydrate(
    snapshot: CountryProfileSnapshot,
    deps: CountryProfileDependencies,
  ): CountryProfile {
    return new CountryProfile(
      snapshot.countryCode,
      snapshot.status,
      [...snapshot.levels],
      snapshot.version,
      deps,
    );
  }

  // -------------------------------------------------------------- accessors

  get status(): CountryProfileStatus {
    return this.currentStatus;
  }

  /** A copy — callers must not mutate the internal array. */
  get levels(): readonly LevelDefinition[] {
    return [...this.currentLevels];
  }

  get version(): number {
    return this.currentVersion;
  }

  get expectedVersion(): number {
    return this.loadedVersion;
  }

  /**
   * Whether this profile declares the given level.
   */
  hasLevel(level: AdministrativeLevel): boolean {
    return this.currentLevels.some((def) => def.level === level);
  }

  /**
   * The number of registerable levels declared.
   */
  get levelCount(): number {
    return this.currentLevels.length;
  }

  snapshot(): CountryProfileSnapshot {
    return {
      countryCode: this.countryCode,
      status: this.currentStatus,
      levels: [...this.currentLevels],
      version: this.currentVersion,
    };
  }

  // --------------------------------------------------------------- events

  pullEvents(): DomainEvent[] {
    return this.pending.splice(0, this.pending.length);
  }

  // --------------------------------------------------------------- mutation

  /**
   * Replaces the declared levels.
   *
   * `areasAtLevel` is a set of levels that currently carry areas.  Invariant 7
   * forbids removing such a level.  The factory passes this information; the
   * aggregate itself never touches a repository.
   *
   * Contiguity and uniqueness invariants are re-checked on the new set.
   */
  changeLevels(
    newLevels: readonly LevelDefinition[],
    areasAtLevel: ReadonlySet<AdministrativeLevel>,
  ): Result<void, GeographyRuleViolation> {
    const levelsCheck = validateLevels([...newLevels]);
    if (!levelsCheck.ok) return levelsCheck;

    // Invariant 7: a level that carries areas cannot be removed.
    for (const level of areasAtLevel) {
      const stillPresent = newLevels.some((def) => def.level === level);
      if (!stillPresent) {
        return err(
          GeographyRuleViolation.violated(
            GeographyRule.LEVEL_IN_USE,
            `Cannot remove ${level}: it carries existing areas.`,
          ),
        );
      }
    }

    const previous = [...this.currentLevels];
    this.currentLevels = [...newLevels];

    this.record(CountryProfileEventType.LEVELS_CHANGED, {
      countryCode: this.countryCode,
      previousLevels: previous,
      newLevels: [...newLevels],
    });

    return ok(undefined);
  }

  /**
   * Transitions the profile to PUBLISHED.
   *
   * Invariant 4: a published profile must declare at least one level.
   */
  publish(): Result<void, GeographyRuleViolation> {
    if (this.currentLevels.length === 0) {
      return err(
        GeographyRuleViolation.violated(
          GeographyRule.PUBLISHED_REQUIRES_LEVEL,
          'A published profile must declare at least one level.',
        ),
      );
    }

    return this.moveTo(
      CountryProfileStatus.PUBLISHED,
      CountryProfileEventType.PUBLISHED,
    );
  }

  /**
   * Transitions the profile to DEPRECATED.
   *
   * DEPRECATED is terminal.
   */
  deprecate(): Result<void, GeographyRuleViolation> {
    return this.moveTo(
      CountryProfileStatus.DEPRECATED,
      CountryProfileEventType.DEPRECATED,
    );
  }

  // --------------------------------------------------------------- private

  private moveTo(
    to: CountryProfileStatus,
    eventType: CountryProfileEventTypeValue,
  ): Result<void, GeographyRuleViolation> {
    const allowed = checkCountryProfileTransition(this.currentStatus, to);
    if (!allowed.ok) return allowed;

    const from = this.currentStatus;
    this.currentStatus = to;
    this.record(eventType, {
      countryCode: this.countryCode,
      from,
      to,
    });

    return ok(undefined);
  }

  private record(
    eventType: CountryProfileEventTypeValue,
    payload: Record<string, unknown>,
  ): void {
    this.currentVersion += 1;
    this.pending.push(
      buildDomainEvent(
        {
          eventType,
          aggregate: COUNTRY_PROFILE_AGGREGATE,
          aggregateId: this.countryCode,
          version: this.currentVersion,
          payload,
          occurredAt: this.deps.clock.nowIso(),
        },
        () => this.deps.ids.generate(),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Level-set validation (invariants 2, 3)
// ---------------------------------------------------------------------------

function validateLevels(
  levels: LevelDefinition[],
): Result<void, GeographyRuleViolation> {
  if (levels.length === 0) return ok(undefined);

  // Invariant 3: uniqueness
  const seen = new Set<AdministrativeLevel>();
  for (const def of levels) {
    if (seen.has(def.level)) {
      return err(
        GeographyRuleViolation.violated(
          GeographyRule.DUPLICATE_LEVEL,
          `Level ${def.level} is declared more than once.`,
        ),
      );
    }
    seen.add(def.level);
  }

  // Invariant 2: contiguity from LEVEL_1
  // Sort by rank and check that ranks form 1, 2, 3, … with no gap.
  const sorted = [...levels].sort(
    (a, b) => levelRank(a.level) - levelRank(b.level),
  );

  for (let i = 0; i < sorted.length; i++) {
    const expected = i + 1; // LEVEL_1 = 1, LEVEL_2 = 2, …
    const actual = levelRank(sorted[i]!.level);
    if (actual !== expected) {
      return err(
        GeographyRuleViolation.violated(
          GeographyRule.LEVELS_NOT_CONTIGUOUS,
          `Levels must be contiguous from LEVEL_1; found a gap at rank ${expected}.`,
        ),
      );
    }
  }

  return ok(undefined);
}
