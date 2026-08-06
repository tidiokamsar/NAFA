import { err, ok, type Result } from '@nafa/shared';
import {
  GeographyRule,
  GeographyRuleViolation,
} from '../../country-profile/domain/country-profile.errors';

/**
 * Lifecycle statuses for an administrative area.
 *
 * - ACTIVE — the area is current and usable.
 * - MERGED — the area was merged into one or more successors.
 * - SPLIT — the area was split into two or more successors.
 * - DISSOLVED — the area no longer exists and has no successor.
 */
export enum AreaStatus {
  ACTIVE = 'ACTIVE',
  MERGED = 'MERGED',
  SPLIT = 'SPLIT',
  DISSOLVED = 'DISSOLVED',
}

/** Allowed transitions per status. */
const TRANSITIONS: Record<AreaStatus, readonly AreaStatus[]> = {
  [AreaStatus.ACTIVE]: [
    AreaStatus.MERGED,
    AreaStatus.SPLIT,
    AreaStatus.DISSOLVED,
  ],
  [AreaStatus.MERGED]: [],
  [AreaStatus.SPLIT]: [],
  [AreaStatus.DISSOLVED]: [],
};

/**
 * Checks whether a status transition is allowed.
 *
 * Also rejects same-status transitions (an area that is already MERGED
 * cannot be merged again).
 */
export function checkAreaTransition(
  from: AreaStatus,
  to: AreaStatus,
): Result<void, GeographyRuleViolation> {
  if (from === to) {
    return err(
      GeographyRuleViolation.transition(
        GeographyRule.INVALID_STATUS_TRANSITION,
        `Area is already ${from}.`,
      ),
    );
  }

  const allowed = TRANSITIONS[from];
  if (!allowed.includes(to)) {
    return err(
      GeographyRuleViolation.transition(
        GeographyRule.INVALID_STATUS_TRANSITION,
        `Cannot transition from ${from} to ${to}.`,
      ),
    );
  }

  return ok(undefined);
}
