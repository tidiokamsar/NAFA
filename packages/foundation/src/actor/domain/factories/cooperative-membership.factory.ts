import type { Result } from '@nafa/shared';
import type { Actor, ActorDependencies } from '../actor.aggregate';
import { ActorRule, type ActorRuleViolation } from '../actor.errors';
import type { CooperativeMembership } from '../membership';
import { cooperativeMembershipId } from '../membership';
import type { CooperativeMembershipService } from '../services/cooperative-membership.service';
import { isoDate, type IsoDate } from '../value-objects';

export interface CreateMembershipInput {
  readonly cooperative: Actor;
  readonly member: Actor;
  /** Defaults to today, read from the injected clock. */
  readonly admittedAt?: string;
}

/**
 * Builds a membership, or refuses.
 *
 * It generates the identifier and derives the admission date from the clock,
 * then hands the decision to the service — which is where the rules that span
 * two actors and the whole collection already live. Duplicating them here
 * would give two places to change when a rule moves.
 *
 * `admittedAt` can be supplied for back-dated enrolment, which paper records
 * regularly require, but defaults to the clock so the ordinary path cannot
 * get it wrong.
 */
export class CooperativeMembershipFactory {
  constructor(
    private readonly memberships: CooperativeMembershipService,
    private readonly deps: ActorDependencies,
  ) {}

  async create(
    input: CreateMembershipInput,
  ): Promise<Result<CooperativeMembership, ActorRuleViolation>> {
    const admittedAt = this.resolveAdmissionDate(input.admittedAt);
    if (!admittedAt.ok) return admittedAt;

    const id = cooperativeMembershipId(this.deps.ids.generate());
    if (!id.ok) return id;

    return this.memberships.admit({
      id: id.value,
      cooperative: input.cooperative,
      member: input.member,
      admittedAt: admittedAt.value,
    });
  }

  private resolveAdmissionDate(
    supplied?: string,
  ): Result<IsoDate, ActorRuleViolation> {
    // The clock gives an instant; an admission is a day. Taking the date part
    // rather than storing a timestamp keeps the value comparable to the
    // membership's own end date, which is also a day.
    const raw = supplied ?? this.deps.clock.nowIso().slice(0, 10);

    return isoDate(raw, ActorRule.INVALID_BIRTH_DATE, 'Admission date');
  }
}
