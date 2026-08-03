import { err, ok, type Result } from '@nafa/shared';
import type { CooperativeMembershipRepository } from '../ports/cooperative-membership-repository.port';
import type { Actor, ActorDependencies } from '../actor.aggregate';
import { ActorStatus } from '../actor-status.vo';
import { ActorRule, ActorRuleViolation } from '../actor.errors';
import { CooperativeMembership } from '../membership';
import type { CooperativeMembershipId } from '../membership';
import type { IsoDate } from '../value-objects';

/**
 * Admission, which no single aggregate can decide alone.
 *
 * Two aggregates are involved — the cooperative and the member — and one rule
 * spans the whole collection: the same member cannot hold two active
 * memberships of the same cooperative. An aggregate cannot see its siblings,
 * so that check has to be asked of the repository, which is exactly what makes
 * this a domain service rather than a method on CooperativeMembership.
 *
 * It stays in the domain: it holds a port, not an implementation, and it
 * imports nothing that boots or connects.
 */
export class CooperativeMembershipService {
  constructor(
    private readonly memberships: CooperativeMembershipRepository,
    private readonly deps: ActorDependencies,
  ) {}

  /**
   * @param cooperative the admitting body
   * @param member the person or company being admitted
   */
  async admit(input: {
    id: CooperativeMembershipId;
    cooperative: Actor;
    member: Actor;
    admittedAt: IsoDate;
  }): Promise<Result<CooperativeMembership, ActorRuleViolation>> {
    const { cooperative, member } = input;

    // Checked before the aggregate is asked, because it is the cooperative's
    // own state rather than a property of the membership. A cooperative that
    // is closed, suspended or still a draft has no roll to add anyone to.
    if (cooperative.status !== ActorStatus.ACTIVE) {
      return err(
        ActorRuleViolation.violated(
          ActorRule.COOPERATIVE_NOT_ACTIVE,
          `A cooperative in ${cooperative.status} cannot admit members.`,
        ),
      );
    }

    const existing = await this.memberships.findActiveBetween(
      cooperative.id,
      member.id,
    );

    if (existing) {
      return err(
        ActorRuleViolation.violated(
          ActorRule.MEMBER_ALREADY_ADMITTED,
          'The member already holds an active membership of this cooperative.',
        ),
      );
    }

    // Everything left is the membership's own rule, so it decides.
    return CooperativeMembership.admit(
      {
        id: input.id,
        cooperativeId: cooperative.id,
        cooperativeNature: cooperative.identity.nature,
        memberId: member.id,
        memberNature: member.identity.nature,
        admittedAt: input.admittedAt,
      },
      this.deps,
    );
  }

  /**
   * True when the member currently belongs to the cooperative.
   *
   * Offered here rather than on the repository so callers ask a business
   * question instead of writing the null check themselves.
   */
  async isMember(
    cooperative: Actor,
    member: Actor,
  ): Promise<Result<boolean, ActorRuleViolation>> {
    const membership = await this.memberships.findActiveBetween(
      cooperative.id,
      member.id,
    );

    return ok(membership !== null);
  }
}
