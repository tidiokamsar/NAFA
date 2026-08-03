import {
  buildDomainEvent,
  type DomainEvent,
  err,
  ok,
  type Result,
} from '@nafa/shared';
import type { ActorDependencies } from '../actor.aggregate';
import { ActorRule, ActorRuleViolation } from '../actor.errors';
import { ActorNature } from '../identity';
import type { ActorId, IsoDate } from '../value-objects';
import type { CooperativeMembershipId } from './cooperative-membership-id.vo';
import {
  MEMBERSHIP_AGGREGATE,
  MembershipEventType,
  type MembershipEventType as MembershipEventTypeValue,
} from './cooperative-membership.events';
import {
  MembershipStatus,
  checkMembershipTransition,
} from './membership-status.vo';

/**
 * The natures a member may have.
 *
 * A cooperative cannot join another cooperative. Allowing it would let two
 * bodies own each other, and a membership graph with cycles has no defensible
 * answer to "who are the ultimate members".
 */
const ADMISSIBLE_MEMBER_NATURES: readonly ActorNature[] = [
  ActorNature.PERSON,
  ActorNature.COMPANY,
];

export interface AdmitMemberInput {
  readonly id: CooperativeMembershipId;
  readonly cooperativeId: ActorId;
  readonly cooperativeNature: ActorNature;
  readonly memberId: ActorId;
  readonly memberNature: ActorNature;
  readonly admittedAt: IsoDate;
}

export interface CooperativeMembershipSnapshot {
  readonly id: CooperativeMembershipId;
  readonly cooperativeId: ActorId;
  readonly memberId: ActorId;
  readonly status: MembershipStatus;
  readonly admittedAt: IsoDate;
  readonly endedAt?: IsoDate;
  readonly version: number;
}

/**
 * One person's or company's membership of one cooperative.
 *
 * A separate aggregate, not a collection inside Actor. A cooperative can have
 * thousands of members: loading them all to change a phone number would be a
 * permanent cost, and two unrelated updates — a member joining, a contact
 * being corrected — would collide over one version counter for no business
 * reason.
 *
 * It holds two ActorIds and never an Actor. That is what keeps the two
 * aggregates independently loadable and independently consistent.
 *
 * Deliberately narrow: no share capital, no dues, no general meetings, no
 * statutory documents. Those belong to a cooperative master, and putting them
 * here would make this aggregate the place every cooperative concern accretes.
 */
export class CooperativeMembership {
  private readonly pending: DomainEvent[] = [];

  /**
   * The version this membership was loaded at, frozen for its lifetime.
   *
   * Same reasoning as Actor: `version` moves with every mutation, so it is the
   * wrong value to compare against the stored row — by the time a caller
   * saves, it has already moved.
   */
  private readonly loadedVersion: number;

  private constructor(
    readonly id: CooperativeMembershipId,
    readonly cooperativeId: ActorId,
    readonly memberId: ActorId,
    private currentStatus: MembershipStatus,
    readonly admittedAt: IsoDate,
    private currentEndedAt: IsoDate | undefined,
    private currentVersion: number,
    private readonly deps: ActorDependencies,
  ) {
    this.loadedVersion = currentVersion;
  }

  /**
   * Admits a member.
   *
   * Natures are passed in rather than looked up: an aggregate that reached for
   * a repository would need one, and the point of referencing by id is that it
   * does not. The service that loads both actors supplies them.
   */
  static admit(
    input: AdmitMemberInput,
    deps: ActorDependencies,
  ): Result<CooperativeMembership, ActorRuleViolation> {
    if (input.cooperativeNature !== ActorNature.COOPERATIVE) {
      return err(
        ActorRuleViolation.violated(
          ActorRule.NOT_A_COOPERATIVE,
          'Only a cooperative can admit members.',
        ),
      );
    }

    if (input.cooperativeId === input.memberId) {
      return err(
        ActorRuleViolation.violated(
          ActorRule.MEMBER_CANNOT_BE_COOPERATIVE,
          'A cooperative cannot be a member of itself.',
        ),
      );
    }

    if (!ADMISSIBLE_MEMBER_NATURES.includes(input.memberNature)) {
      return err(
        ActorRuleViolation.violated(
          ActorRule.MEMBER_CANNOT_BE_COOPERATIVE,
          'A member must be a person or a company.',
        ),
      );
    }

    const membership = new CooperativeMembership(
      input.id,
      input.cooperativeId,
      input.memberId,
      MembershipStatus.ACTIVE,
      input.admittedAt,
      undefined,
      0,
      deps,
    );

    membership.record(MembershipEventType.MEMBER_ADMITTED, {
      membershipId: membership.id,
      cooperativeId: membership.cooperativeId,
      memberId: membership.memberId,
      admittedAt: input.admittedAt,
    });

    return ok(membership);
  }

  /** Rebuilds from storage. Runs no rules and emits nothing — see Actor. */
  static rehydrate(
    snapshot: CooperativeMembershipSnapshot,
    deps: ActorDependencies,
  ): CooperativeMembership {
    return new CooperativeMembership(
      snapshot.id,
      snapshot.cooperativeId,
      snapshot.memberId,
      snapshot.status,
      snapshot.admittedAt,
      snapshot.endedAt,
      snapshot.version,
      deps,
    );
  }

  get status(): MembershipStatus {
    return this.currentStatus;
  }

  get endedAt(): IsoDate | undefined {
    return this.currentEndedAt;
  }

  get version(): number {
    return this.currentVersion;
  }

  /**
   * What the stored row should still hold, if nobody else wrote meanwhile.
   *
   * 0 for a membership that has never been persisted, which is what lets a
   * repository tell an insert from an update without a second question.
   */
  get expectedVersion(): number {
    return this.loadedVersion;
  }

  get isActive(): boolean {
    return this.currentStatus === MembershipStatus.ACTIVE;
  }

  snapshot(): CooperativeMembershipSnapshot {
    return {
      id: this.id,
      cooperativeId: this.cooperativeId,
      memberId: this.memberId,
      status: this.currentStatus,
      admittedAt: this.admittedAt,
      ...(this.currentEndedAt ? { endedAt: this.currentEndedAt } : {}),
      version: this.currentVersion,
    };
  }

  pullEvents(): DomainEvent[] {
    return this.pending.splice(0, this.pending.length);
  }

  /** The member left of their own accord. */
  resign(endedAt: IsoDate, reason?: string): Result<void, ActorRuleViolation> {
    return this.end(
      MembershipStatus.RESIGNED,
      MembershipEventType.MEMBER_RESIGNED,
      endedAt,
      reason,
    );
  }

  /**
   * The cooperative removed the member.
   *
   * A reason is required, unlike resignation: exclusion is a decision taken
   * against someone, and one with no recorded cause is indefensible if it is
   * ever challenged.
   */
  exclude(endedAt: IsoDate, reason: string): Result<void, ActorRuleViolation> {
    return this.end(
      MembershipStatus.EXCLUDED,
      MembershipEventType.MEMBER_EXCLUDED,
      endedAt,
      reason,
    );
  }

  private end(
    to: MembershipStatus,
    eventType: MembershipEventTypeValue,
    endedAt: IsoDate,
    reason?: string,
  ): Result<void, ActorRuleViolation> {
    const allowed = checkMembershipTransition(this.currentStatus, to);
    if (!allowed.ok) {
      return allowed;
    }

    if (endedAt < this.admittedAt) {
      return err(
        ActorRuleViolation.violated(
          ActorRule.MEMBERSHIP_ALREADY_ENDED,
          'A membership cannot end before it began.',
        ),
      );
    }

    const from = this.currentStatus;
    this.currentStatus = to;
    this.currentEndedAt = endedAt;
    this.record(eventType, {
      membershipId: this.id,
      cooperativeId: this.cooperativeId,
      memberId: this.memberId,
      from,
      to,
      endedAt,
      ...(reason ? { reason } : {}),
    });

    return ok(undefined);
  }

  /** Same contract as Actor: bump the version, then buffer the event. */
  private record(
    eventType: MembershipEventTypeValue,
    payload: Record<string, unknown>,
  ): void {
    this.currentVersion += 1;
    this.pending.push(
      buildDomainEvent(
        {
          eventType,
          aggregate: MEMBERSHIP_AGGREGATE,
          aggregateId: this.id,
          version: this.currentVersion,
          payload,
          occurredAt: this.deps.clock.nowIso(),
        },
        () => this.deps.ids.generate(),
      ),
    );
  }
}
