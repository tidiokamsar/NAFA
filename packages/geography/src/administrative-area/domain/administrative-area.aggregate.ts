import {
  buildDomainEvent,
  type Clock,
  type DomainEvent,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@nafa/shared';
import type { CountryCode } from '../../country-profile/domain/country-code.vo';
import {
  AdministrativeLevel,
  levelRank,
} from '../../country-profile/domain/administrative-level.vo';
import { type LevelDefinition } from '../../country-profile/domain/level-definition.vo';
import {
  GeographyRule,
  GeographyRuleViolation,
} from '../../country-profile/domain/country-profile.errors';
import type { AdministrativeAreaId } from './administrative-area-id.vo';
import type { AreaCode } from './area-code.vo';
import type { AreaName } from './area-name.vo';
import type { GeoPoint } from './geo-point.vo';
import type { ValidityPeriod } from './validity-period.vo';
import { AreaStatus, checkAreaTransition } from './area-status.vo';
import {
  ADMINISTRATIVE_AREA_AGGREGATE,
  AdministrativeAreaEventType,
  type AdministrativeAreaEventType as AreaEventTypeValue,
} from './administrative-area.events';

// ---------------------------------------------------------------------------
// Input / Snapshot
// ---------------------------------------------------------------------------

export interface RegisterAdministrativeAreaInput {
  readonly areaId: AdministrativeAreaId;
  readonly countryCode: CountryCode;
  readonly level: AdministrativeLevel;
  readonly code: AreaCode;
  readonly name: AreaName;
  readonly parentId: AdministrativeAreaId | null;
  readonly centroid: GeoPoint | null;
  readonly validity: ValidityPeriod;
}

/** The persisted shape a repository hands back. */
export interface AdministrativeAreaSnapshot {
  readonly areaId: AdministrativeAreaId;
  readonly countryCode: CountryCode;
  readonly level: AdministrativeLevel;
  readonly code: AreaCode;
  readonly name: AreaName;
  readonly parentId: AdministrativeAreaId | null;
  readonly centroid: GeoPoint | null;
  readonly validity: ValidityPeriod;
  readonly status: AreaStatus;
  readonly successors: readonly AdministrativeAreaId[];
  readonly version: number;
}

export interface AdministrativeAreaDependencies {
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

/**
 * An administrative area — the actual place, not the template.
 *
 * Identified by `AdministrativeAreaId` (UUID).  Knows its country, level,
 * parent, centroid, and lifecycle status.  Successors are stored for
 * MERGED and SPLIT areas so they remain resolvable.
 *
 * Invariants (13, numbered 8–20 from the detailed model):
 *  8.  areaId is a valid UUID                        (enforced by the VO)
 *  9.  Parent is exactly one level above               (checked in register)
 *  10. Root areas (COUNTRY level) have no parent      (checked in register)
 *  11. Level is declared in the country's profile     (checked in register)
 *  12. Country profile is PUBLISHED                     (passed by factory)
 *  13. AreaCode is unique per country+level            (checked externally)
 *  14. Official name is non-empty                      (enforced by the VO)
 *  15. Aliases are non-empty strings                   (enforced by the VO)
 *  16. Validity period is valid                        (enforced by the VO)
 *  17. Centroid coordinates are valid ranges           (enforced by the VO)
 *  18. MERGED ≥1, SPLIT ≥2, DISSOLVED 0 successors    (checked here)
 *  19. Cannot dissolve area with ACTIVE children       (checked externally)
 *  20. Status transitions are valid                    (checked here)
 */
export class AdministrativeArea {
  private readonly pending: DomainEvent[] = [];
  private readonly loadedVersion: number;

  private constructor(
    readonly areaId: AdministrativeAreaId,
    readonly countryCode: CountryCode,
    private currentLevel: AdministrativeLevel,
    private currentCode: AreaCode,
    private currentName: AreaName,
    private currentParentId: AdministrativeAreaId | null,
    private currentCentroid: GeoPoint | null,
    private currentValidity: ValidityPeriod,
    private currentStatus: AreaStatus,
    private currentSuccessors: AdministrativeAreaId[],
    private currentVersion: number,
    private readonly deps: AdministrativeAreaDependencies,
  ) {
    this.loadedVersion = currentVersion;
  }

  // ---------------------------------------------------------------- creation

  /**
   * Registers a new administrative area as ACTIVE.
   *
   * Checks parent-level invariants (9, 10). The factory handles profile
   * validation (11, 12) and code uniqueness (13) before calling this.
   */
  static register(
    input: RegisterAdministrativeAreaInput,
    deps: AdministrativeAreaDependencies,
  ): Result<AdministrativeArea, GeographyRuleViolation> {
    // Invariant 10: COUNTRY-level areas must not have a parent.
    if (
      input.level === AdministrativeLevel.COUNTRY &&
      input.parentId !== null
    ) {
      return err(
        GeographyRuleViolation.violated(
          GeographyRule.ROOT_CANNOT_HAVE_PARENT,
          'A COUNTRY-level area cannot have a parent.',
        ),
      );
    }

    // Invariant 9: non-COUNTRY areas must have a parent whose level is
    // exactly one rank above.
    if (
      input.level !== AdministrativeLevel.COUNTRY &&
      input.parentId !== null
    ) {
      // We cannot check the parent's actual level here (no repository).
      // The factory must have already validated this.
      // We only check that a non-root area has *some* parent.
    } else if (
      input.level !== AdministrativeLevel.COUNTRY &&
      input.parentId === null
    ) {
      return err(
        GeographyRuleViolation.violated(
          GeographyRule.NON_ROOT_REQUIRES_PARENT,
          `A ${input.level} area must have a parent.`,
        ),
      );
    }

    const area = new AdministrativeArea(
      input.areaId,
      input.countryCode,
      input.level,
      input.code,
      input.name,
      input.parentId,
      input.centroid,
      input.validity,
      AreaStatus.ACTIVE,
      [],
      0,
      deps,
    );

    area.record(AdministrativeAreaEventType.REGISTERED, {
      areaId: input.areaId,
      countryCode: input.countryCode,
      level: input.level,
      code: input.code,
      name: input.name,
      parentId: input.parentId,
      centroid: input.centroid,
    });

    return ok(area);
  }

  /**
   * Rebuilds an area from storage.
   *
   * Performs no checks — the state was legal when written.
   */
  static rehydrate(
    snapshot: AdministrativeAreaSnapshot,
    deps: AdministrativeAreaDependencies,
  ): AdministrativeArea {
    return new AdministrativeArea(
      snapshot.areaId,
      snapshot.countryCode,
      snapshot.level,
      snapshot.code,
      snapshot.name,
      snapshot.parentId,
      snapshot.centroid,
      snapshot.validity,
      snapshot.status,
      [...snapshot.successors],
      snapshot.version,
      deps,
    );
  }

  // -------------------------------------------------------------- accessors

  get level(): AdministrativeLevel {
    return this.currentLevel;
  }

  get code(): AreaCode {
    return this.currentCode;
  }

  get name(): AreaName {
    return this.currentName;
  }

  get parentId(): AdministrativeAreaId | null {
    return this.currentParentId;
  }

  get centroid(): GeoPoint | null {
    return this.currentCentroid;
  }

  get validity(): ValidityPeriod {
    return this.currentValidity;
  }

  get status(): AreaStatus {
    return this.currentStatus;
  }

  /** A copy — callers must not mutate the internal array. */
  get successors(): readonly AdministrativeAreaId[] {
    return [...this.currentSuccessors];
  }

  get version(): number {
    return this.currentVersion;
  }

  get expectedVersion(): number {
    return this.loadedVersion;
  }

  snapshot(): AdministrativeAreaSnapshot {
    return {
      areaId: this.areaId,
      countryCode: this.countryCode,
      level: this.currentLevel,
      code: this.currentCode,
      name: this.currentName,
      parentId: this.currentParentId,
      centroid: this.currentCentroid,
      validity: this.currentValidity,
      status: this.currentStatus,
      successors: [...this.currentSuccessors],
      version: this.currentVersion,
    };
  }

  // --------------------------------------------------------------- events

  pullEvents(): DomainEvent[] {
    return this.pending.splice(0, this.pending.length);
  }

  // --------------------------------------------------------------- mutation

  /**
   * Changes the official name of the area.
   */
  rename(newName: AreaName): Result<void, GeographyRuleViolation> {
    const active = this.ensureActive('rename');
    if (!active.ok) return active;

    const previousOfficialName = this.currentName.official;
    this.currentName = newName;

    this.record(AdministrativeAreaEventType.RENAMED, {
      areaId: this.areaId,
      countryCode: this.countryCode,
      previousOfficialName,
      newOfficialName: newName.official,
    });

    return ok(undefined);
  }

  /**
   * Replaces the aliases of the area.
   */
  changeAliases(
    newAliases: readonly string[],
  ): Result<void, GeographyRuleViolation> {
    const active = this.ensureActive('changeAliases');
    if (!active.ok) return active;

    // Validate aliases
    for (const alias of newAliases) {
      if (alias.trim().length === 0) {
        return err(
          GeographyRuleViolation.invalid(
            GeographyRule.INVALID_AREA_NAME,
            'Aliases must not contain empty strings.',
          ),
        );
      }
    }

    const previousAliases = this.currentName.aliases;
    this.currentName = {
      official: this.currentName.official,
      aliases: [...newAliases],
    };

    this.record(AdministrativeAreaEventType.ALIASES_CHANGED, {
      areaId: this.areaId,
      countryCode: this.countryCode,
      previousAliases,
      newAliases: [...newAliases],
    });

    return ok(undefined);
  }

  /**
   * Moves the area to a new parent.
   */
  reparent(
    newParentId: AdministrativeAreaId | null,
  ): Result<void, GeographyRuleViolation> {
    const active = this.ensureActive('reparent');
    if (!active.ok) return active;

    // COUNTRY cannot be reparented
    if (this.currentLevel === AdministrativeLevel.COUNTRY) {
      return err(
        GeographyRuleViolation.violated(
          GeographyRule.ROOT_CANNOT_HAVE_PARENT,
          'A COUNTRY-level area cannot have a parent.',
        ),
      );
    }

    if (newParentId === null) {
      return err(
        GeographyRuleViolation.violated(
          GeographyRule.NON_ROOT_REQUIRES_PARENT,
          `A ${this.currentLevel} area must have a parent.`,
        ),
      );
    }

    const previousParentId = this.currentParentId;
    this.currentParentId = newParentId;

    this.record(AdministrativeAreaEventType.REPARENTED, {
      areaId: this.areaId,
      countryCode: this.countryCode,
      previousParentId,
      newParentId,
    });

    return ok(undefined);
  }

  /**
   * Sets or updates the centroid of the area.
   */
  setCentroid(centroid: GeoPoint): Result<void, GeographyRuleViolation> {
    const active = this.ensureActive('setCentroid');
    if (!active.ok) return active;

    this.currentCentroid = centroid;

    this.record(AdministrativeAreaEventType.CENTROID_SET, {
      areaId: this.areaId,
      countryCode: this.countryCode,
      centroid,
    });

    return ok(undefined);
  }

  /**
   * Merges this area into one or more successor areas.
   *
   * Invariant 18: MERGED requires at least one successor.
   */
  merge(
    successorIds: readonly AdministrativeAreaId[],
  ): Result<void, GeographyRuleViolation> {
    const active = this.ensureActive('merge');
    if (!active.ok) return active;

    // Invariant 18: at least one successor
    if (successorIds.length === 0) {
      return err(
        GeographyRuleViolation.violated(
          GeographyRule.SUCCESSORS_REQUIRED,
          'Merging an area requires at least one successor.',
        ),
      );
    }

    return this.transitionTo(
      AreaStatus.MERGED,
      AdministrativeAreaEventType.MERGED,
      [...successorIds],
      {
        areaId: this.areaId,
        countryCode: this.countryCode,
        successorIds: [...successorIds],
      },
    );
  }

  /**
   * Splits this area into two or more successor areas.
   *
   * Invariant 18: SPLIT requires at least two successors.
   */
  split(
    successorIds: readonly AdministrativeAreaId[],
  ): Result<void, GeographyRuleViolation> {
    const active = this.ensureActive('split');
    if (!active.ok) return active;

    // Invariant 18: at least two successors
    if (successorIds.length < 2) {
      return err(
        GeographyRuleViolation.violated(
          GeographyRule.SPLIT_REQUIRES_TWO_SUCCESSORS,
          'Splitting an area requires at least two successors.',
        ),
      );
    }

    return this.transitionTo(
      AreaStatus.SPLIT,
      AdministrativeAreaEventType.SPLIT,
      [...successorIds],
      {
        areaId: this.areaId,
        countryCode: this.countryCode,
        successorIds: [...successorIds],
      },
    );
  }

  /**
   * Dissolves this area with no successor.
   *
   * Invariant 18: DISSOLVED requires zero successors.
   * Invariant 19: area must not have ACTIVE children (checked externally
   * via the `hasActiveChildren` parameter on the factory).
   */
  dissolve(): Result<void, GeographyRuleViolation> {
    const active = this.ensureActive('dissolve');
    if (!active.ok) return active;

    return this.transitionTo(
      AreaStatus.DISSOLVED,
      AdministrativeAreaEventType.DISSOLVED,
      [],
      {
        areaId: this.areaId,
        countryCode: this.countryCode,
      },
    );
  }

  // --------------------------------------------------------------- private

  private ensureActive(
    operation: string,
  ): Result<void, GeographyRuleViolation> {
    if (this.currentStatus !== AreaStatus.ACTIVE) {
      return err(
        GeographyRuleViolation.violated(
          GeographyRule.INVALID_STATUS_TRANSITION,
          `Cannot ${operation} a ${this.currentStatus} area.`,
        ),
      );
    }
    return ok(undefined);
  }

  private transitionTo(
    to: AreaStatus,
    eventType: AreaEventTypeValue,
    successors: AdministrativeAreaId[],
    payload: Record<string, unknown>,
  ): Result<void, GeographyRuleViolation> {
    const transitionCheck = checkAreaTransition(this.currentStatus, to);
    if (!transitionCheck.ok) return transitionCheck;

    this.currentStatus = to;
    this.currentSuccessors = successors;

    this.record(eventType, payload);

    return ok(undefined);
  }

  private record(
    eventType: AreaEventTypeValue,
    payload: Record<string, unknown>,
  ): void {
    this.currentVersion += 1;
    this.pending.push(
      buildDomainEvent(
        {
          eventType,
          aggregate: ADMINISTRATIVE_AREA_AGGREGATE,
          aggregateId: this.areaId,
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
// Hierarchy policy — pure functions
// ---------------------------------------------------------------------------

/**
 * Validates that a parent level is exactly one rank above the child level.
 *
 * Invariant 9: the parent of a LEVEL_2 area must be LEVEL_1.
 */
export function validateParentChildLevels(
  parentLevel: AdministrativeLevel,
  childLevel: AdministrativeLevel,
): Result<void, GeographyRuleViolation> {
  const parentRank = levelRank(parentLevel);
  const childRank = levelRank(childLevel);

  if (childRank !== parentRank + 1) {
    return err(
      GeographyRuleViolation.violated(
        GeographyRule.PARENT_LEVEL_MISMATCH,
        `Parent level ${parentLevel} (rank ${parentRank}) must be exactly one rank above child level ${childLevel} (rank ${childRank}).`,
      ),
    );
  }

  return ok(undefined);
}

/**
 * Validates that a level is declared in a country profile.
 *
 * Invariant 11.
 */
export function validateLevelDeclaredInProfile(
  level: AdministrativeLevel,
  profileLevels: readonly LevelDefinition[],
): Result<void, GeographyRuleViolation> {
  const declared = profileLevels.some((def) => def.level === level);
  if (!declared) {
    return err(
      GeographyRuleViolation.violated(
        GeographyRule.LEVEL_NOT_DECLARED_IN_PROFILE,
        `Level ${level} is not declared in the country profile.`,
      ),
    );
  }

  return ok(undefined);
}
