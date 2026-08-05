import type { DomainEvent } from '@nafa/shared';
import type { ActorId, IsoDate } from '../value-objects';
import type { CooperativeMembershipId } from './cooperative-membership-id.vo';
import type { MembershipStatus } from './membership-status.vo';

/**
 * What the membership aggregate announces.
 *
 * The prefix is the aggregate name in kebab-case, exactly as `Actor` gives
 * `actor.*`. A consumer can therefore derive one from the other and route on
 * either. An earlier draft used `cooperative.*`, which read better but meant
 * the prefix and the `aggregate` field disagreed — a subscriber filtering on
 * one would silently miss what a subscriber filtering on the other received.
 */
export const MembershipEventType = {
  MEMBER_ADMITTED: 'cooperative-membership.admitted',
  MEMBER_RESIGNED: 'cooperative-membership.resigned',
  MEMBER_EXCLUDED: 'cooperative-membership.excluded',
} as const;

export type MembershipEventType =
  (typeof MembershipEventType)[keyof typeof MembershipEventType];

export const MEMBERSHIP_AGGREGATE = 'CooperativeMembership';

export interface MemberAdmittedPayload {
  membershipId: CooperativeMembershipId;
  cooperativeId: ActorId;
  memberId: ActorId;
  admittedAt: IsoDate;
}

export interface MembershipEndedPayload {
  membershipId: CooperativeMembershipId;
  cooperativeId: ActorId;
  memberId: ActorId;
  from: MembershipStatus;
  to: MembershipStatus;
  endedAt: IsoDate;
  reason?: string;
}

export type MembershipDomainEvent =
  DomainEvent<MemberAdmittedPayload> | DomainEvent<MembershipEndedPayload>;
