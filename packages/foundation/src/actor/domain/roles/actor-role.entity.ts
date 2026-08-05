import { ok, type Result } from '@nafa/shared';
import type { ActorRuleViolation } from '../actor.errors';
import type { ActorNature } from '../identity';
import type { IsoDate } from '../value-objects';
import type { VerificationLevel } from '../verification-level.vo';
import { checkRoleEligibility } from './role-eligibility.policy';
import type { RoleQualification } from './role-qualification.vo';
import type { RoleType } from './role-type.vo';

/**
 * A capacity the actor may act in.
 *
 * Identified by its type, not by a surrogate id: an actor either holds the
 * producer role or it does not, and two producer roles on one actor would mean
 * nothing. That is what makes the aggregate's role collection a set.
 *
 * Deliberately thin. It records the capacity, its kind where that matters, and
 * when it was granted — nothing about what the actor does with it. Revocation
 * and lifecycle belong to the aggregate that owns the set, not here.
 */
export interface ActorRole {
  readonly type: RoleType;
  readonly qualification?: RoleQualification;
  readonly grantedAt: IsoDate;
}

export interface GrantRoleInput {
  readonly type: RoleType;
  readonly nature: ActorNature;
  readonly verification: VerificationLevel;
  readonly grantedAt: IsoDate;
  readonly qualification?: RoleQualification;
}

/**
 * Builds a role, refusing every combination the eligibility policy rejects.
 *
 * There is no other constructor, so an ineligible role is not merely detected
 * — it cannot be brought into existence.
 */
export function grantRole(
  input: GrantRoleInput,
): Result<ActorRole, ActorRuleViolation> {
  const eligibility = checkRoleEligibility({
    type: input.type,
    nature: input.nature,
    verification: input.verification,
    qualification: input.qualification,
  });

  if (!eligibility.ok) {
    return eligibility;
  }

  return ok({
    type: input.type,
    ...(input.qualification ? { qualification: input.qualification } : {}),
    grantedAt: input.grantedAt,
  });
}

export function hasRoleType(
  roles: readonly ActorRole[],
  type: RoleType,
): boolean {
  return roles.some((role) => role.type === type);
}

export function findRole(
  roles: readonly ActorRole[],
  type: RoleType,
): ActorRole | undefined {
  return roles.find((role) => role.type === type);
}
