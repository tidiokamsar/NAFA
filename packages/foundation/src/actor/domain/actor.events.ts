import type { DomainEvent } from '@nafa/shared';
import type { ActorStatus } from './actor-status.vo';
import type { ActorNature } from './identity';
import type { RoleType } from './roles';
import type { ActorId, ContactChannel } from './value-objects';
import type { VerificationLevel } from './verification-level.vo';

/**
 * What the actor aggregate announces.
 *
 * Naming follows the convention already in `@nafa/shared`:
 * `<aggregate>.<past-tense verb>`. Past tense because an event reports
 * something that has happened — a consumer cannot refuse it.
 *
 * Payloads carry identifiers and enumerations, never whole aggregates. A
 * consumer that needs the actor loads it; embedding it would ship a snapshot
 * that is stale the moment it is published.
 */
export const ActorEventType = {
  REGISTERED: 'actor.registered',
  VERIFICATION_UPGRADED: 'actor.verification-upgraded',
  VERIFICATION_REVOKED: 'actor.verification-revoked',
  ROLE_GRANTED: 'actor.role-granted',
  ROLE_REVOKED: 'actor.role-revoked',
  CONTACT_CHANGED: 'actor.contact-changed',
  ADDRESS_CHANGED: 'actor.address-changed',
  SUBMITTED_FOR_VERIFICATION: 'actor.submitted-for-verification',
  ACTIVATED: 'actor.activated',
  SUSPENDED: 'actor.suspended',
  REACTIVATED: 'actor.reactivated',
  CLOSED: 'actor.closed',
} as const;

export type ActorEventType =
  (typeof ActorEventType)[keyof typeof ActorEventType];

/** Every actor event names its aggregate the same way. */
export const ACTOR_AGGREGATE = 'Actor';

export interface ActorRegisteredPayload {
  actorId: ActorId;
  nature: ActorNature;
  status: ActorStatus;
  verification: VerificationLevel;
}

export interface ActorVerificationChangedPayload {
  actorId: ActorId;
  from: VerificationLevel;
  to: VerificationLevel;
  /** Present on a revocation: a downgrade always has a stated cause. */
  reason?: string;
}

export interface ActorRoleChangedPayload {
  actorId: ActorId;
  role: RoleType;
}

export interface ActorContactChangedPayload {
  actorId: ActorId;
  /** Channels now available, not their values — contact details are personal. */
  channels: readonly ContactChannel[];
  count: number;
}

export interface ActorAddressChangedPayload {
  actorId: ActorId;
  /** Region and country only: a street line is personal data. */
  region: string;
  countryCode: string;
}

export interface ActorStatusChangedPayload {
  actorId: ActorId;
  from: ActorStatus;
  to: ActorStatus;
  reason?: string;
}

export type ActorDomainEvent =
  | DomainEvent<ActorRegisteredPayload>
  | DomainEvent<ActorVerificationChangedPayload>
  | DomainEvent<ActorRoleChangedPayload>
  | DomainEvent<ActorContactChangedPayload>
  | DomainEvent<ActorAddressChangedPayload>
  | DomainEvent<ActorStatusChangedPayload>;
