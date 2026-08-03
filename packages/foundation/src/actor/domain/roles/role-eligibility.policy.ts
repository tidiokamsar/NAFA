import { err, ok, type Result } from '@nafa/shared';
import { ActorRule, ActorRuleViolation } from '../actor.errors';
import { ActorNature } from '../identity';
import { VerificationLevel, meetsVerification } from '../verification-level.vo';
import {
  requiresQualification,
  type RoleQualification,
} from './role-qualification.vo';
import { RoleType } from './role-type.vo';

/**
 * Who may hold which role, and on what condition.
 *
 * A pure function over plain data: no aggregate, no repository, no clock. It
 * is the one place the matrix lives, so a rule cannot drift between the
 * factory that creates an actor and the aggregate that grants a role later.
 * Being pure is what makes it exhaustively testable without building anything.
 */

interface RoleRequirement {
  /** Natures allowed to hold the role. */
  readonly natures: readonly ActorNature[];
  /** Minimum verification the actor must already have reached. */
  readonly verification: VerificationLevel;
}

const ALL_NATURES: readonly ActorNature[] = [
  ActorNature.PERSON,
  ActorNature.COMPANY,
  ActorNature.COOPERATIVE,
];

const LEGAL_ENTITIES: readonly ActorNature[] = [
  ActorNature.COMPANY,
  ActorNature.COOPERATIVE,
];

const REQUIREMENTS: Record<RoleType, RoleRequirement> = {
  [RoleType.PRODUCER]: {
    natures: ALL_NATURES,
    verification: VerificationLevel.BASIC,
  },
  [RoleType.MERCHANT]: {
    natures: ALL_NATURES,
    verification: VerificationLevel.BASIC,
  },
  [RoleType.WHOLESALER]: {
    natures: ALL_NATURES,
    verification: VerificationLevel.BASIC,
  },
  [RoleType.BUYER]: {
    natures: ALL_NATURES,
    verification: VerificationLevel.BASIC,
  },
  [RoleType.TRANSPORTER]: {
    natures: ALL_NATURES,
    verification: VerificationLevel.BASIC,
  },
  // A customs code is issued to a legal entity. A natural person cannot hold
  // one, so the role is unreachable for them however well verified they are.
  [RoleType.IMPORTER]: {
    natures: LEGAL_ENTITIES,
    verification: VerificationLevel.ENHANCED,
  },
  // A cooperative is member-owned and governed by the cooperative uniform act;
  // it is not a vehicle for a banking licence. Companies only.
  [RoleType.FINANCIAL]: {
    natures: [ActorNature.COMPANY],
    verification: VerificationLevel.ENHANCED,
  },
};

export function allowedNaturesFor(type: RoleType): readonly ActorNature[] {
  return REQUIREMENTS[type].natures;
}

export function requiredVerificationFor(type: RoleType): VerificationLevel {
  return REQUIREMENTS[type].verification;
}

export interface RoleEligibilityInput {
  readonly type: RoleType;
  readonly nature: ActorNature;
  readonly verification: VerificationLevel;
  readonly qualification?: RoleQualification;
}

/**
 * Decides whether a role may be granted.
 *
 * Returns `Result` rather than throwing: a refused role is an expected answer
 * — a registration form asking "can this actor be an importer?" is not an
 * exceptional situation.
 */
export function checkRoleEligibility(
  input: RoleEligibilityInput,
): Result<void, ActorRuleViolation> {
  const { type, nature, verification, qualification } = input;
  const requirement = REQUIREMENTS[type];

  if (!requirement.natures.includes(nature)) {
    return err(
      ActorRuleViolation.violated(
        ActorRule.ROLE_NATURE_INCOMPATIBLE,
        `A ${nature.toLowerCase()} cannot hold the ${type} role.`,
      ),
    );
  }

  if (!meetsVerification(verification, requirement.verification)) {
    return err(
      ActorRuleViolation.violated(
        ActorRule.ROLE_VERIFICATION_INSUFFICIENT,
        `The ${type} role requires ${requirement.verification} verification; the actor is ${verification}.`,
      ),
    );
  }

  const needsQualification = requiresQualification(type);

  if (needsQualification && !qualification) {
    return err(
      ActorRuleViolation.violated(
        ActorRule.ROLE_QUALIFICATION_REQUIRED,
        `The ${type} role requires a qualification.`,
      ),
    );
  }

  if (!needsQualification && qualification) {
    // Refused rather than ignored: silently dropping it would leave the caller
    // believing something was recorded that was not.
    return err(
      ActorRuleViolation.violated(
        ActorRule.ROLE_QUALIFICATION_UNEXPECTED,
        `The ${type} role does not take a qualification.`,
      ),
    );
  }

  if (qualification && qualification.role !== type) {
    return err(
      ActorRuleViolation.violated(
        ActorRule.ROLE_QUALIFICATION_MISMATCHED,
        `A ${qualification.role} qualification cannot describe the ${type} role.`,
      ),
    );
  }

  return ok(undefined);
}

/** Convenience for callers that only need the boolean. */
export function isRoleEligible(input: RoleEligibilityInput): boolean {
  return checkRoleEligibility(input).ok;
}
