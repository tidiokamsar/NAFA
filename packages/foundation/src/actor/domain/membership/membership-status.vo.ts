import { err, ok, type Result } from '@nafa/shared';
import { ActorRule, ActorRuleViolation } from '../actor.errors';

/**
 * Where a membership stands.
 *
 * Two ways out, kept apart on purpose. Leaving of one's own accord and being
 * removed by the cooperative are different facts about a person, and a single
 * ENDED state would lose which one happened the moment the row is written.
 * Cooperative disputes are exactly the situation where that distinction is
 * asked for later.
 */
export const MembershipStatus = {
  ACTIVE: 'ACTIVE',
  /** The member left. */
  RESIGNED: 'RESIGNED',
  /** The cooperative removed the member. */
  EXCLUDED: 'EXCLUDED',
} as const;

export type MembershipStatus =
  (typeof MembershipStatus)[keyof typeof MembershipStatus];

/**
 * Both endings are terminal.
 *
 * Re-admitting is a new membership, not a revived one: the periods are
 * distinct, and merging them would erase the gap the cooperative may need to
 * account for.
 */
const TRANSITIONS: Record<MembershipStatus, readonly MembershipStatus[]> = {
  [MembershipStatus.ACTIVE]: [
    MembershipStatus.RESIGNED,
    MembershipStatus.EXCLUDED,
  ],
  [MembershipStatus.RESIGNED]: [],
  [MembershipStatus.EXCLUDED]: [],
};

export function canTransitionMembership(
  from: MembershipStatus,
  to: MembershipStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function checkMembershipTransition(
  from: MembershipStatus,
  to: MembershipStatus,
): Result<void, ActorRuleViolation> {
  if (!canTransitionMembership(from, to)) {
    return err(
      ActorRuleViolation.transition(
        ActorRule.MEMBERSHIP_ALREADY_ENDED,
        `A membership cannot go from ${from} to ${to}.`,
      ),
    );
  }
  return ok(undefined);
}
