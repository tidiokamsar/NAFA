import { err, ok, type Result } from '@nafa/shared';
import { ActorRule, ActorRuleViolation } from './actor.errors';

/**
 * How far the actor's identity has been checked.
 *
 * An ordered scale, not a set of flags: every question the domain asks is
 * "is this at least X?", and an ordered enum answers it without the caller
 * enumerating cases. Adding a level between two others is a breaking change
 * to `ORDER`, which is the point — it should be a deliberate act.
 *
 * Deliberately a separate axis from `ActorStatus`. An actor can be active and
 * only BASIC — trading legitimately without ever needing ENHANCED, because it
 * never imports and is not a financial institution. Collapsing the two into
 * one enumeration would look simpler and would forbid that perfectly ordinary
 * case.
 *
 * This is a level, not a KYC file: what documents were seen, by whom and when
 * belongs to a compliance context, not to the actor record.
 */
export const VerificationLevel = {
  /** Nothing checked. An actor at this level cannot hold any role. */
  NONE: 'NONE',
  /** Identity and contact confirmed. Enough for ordinary trade. */
  BASIC: 'BASIC',
  /** Full due diligence. Required where a regulator demands it. */
  ENHANCED: 'ENHANCED',
} as const;

export type VerificationLevel =
  (typeof VerificationLevel)[keyof typeof VerificationLevel];

const ORDER: Record<VerificationLevel, number> = {
  [VerificationLevel.NONE]: 0,
  [VerificationLevel.BASIC]: 1,
  [VerificationLevel.ENHANCED]: 2,
};

/** True when `actual` is at or above `required`. */
export function meetsVerification(
  actual: VerificationLevel,
  required: VerificationLevel,
): boolean {
  return ORDER[actual] >= ORDER[required];
}

/** True when `candidate` is strictly above `current`. */
export function isVerificationUpgrade(
  current: VerificationLevel,
  candidate: VerificationLevel,
): boolean {
  return ORDER[candidate] > ORDER[current];
}

export function verificationLevel(
  raw: string,
): Result<VerificationLevel, ActorRuleViolation> {
  const candidate = raw.trim().toUpperCase();

  if (
    !Object.values(VerificationLevel).includes(candidate as VerificationLevel)
  ) {
    return err(
      ActorRuleViolation.invalid(
        ActorRule.ROLE_VERIFICATION_INSUFFICIENT,
        `Unknown verification level "${raw}".`,
      ),
    );
  }

  return ok(candidate as VerificationLevel);
}
