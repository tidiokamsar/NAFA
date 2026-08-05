import type { Channel } from '../constants/channels';
import type { UnknownRecord } from '../types/primitives';

/**
 * Top-level classification of an audit event.
 *
 * Security is one category among several: the framework covers every "who did
 * what to which record, from where" question, not only authentication.
 */
export const AuditCategory = {
  SECURITY: 'Security',
  /** Create, update, delete on a domain entity. */
  DATA: 'Data',
  /** Reading something sensitive enough that the read itself is auditable. */
  ACCESS: 'Access',
  /** Configuration and administration changes. */
  ADMIN: 'Admin',
  /** Business process steps: submitted, approved, rejected. */
  BUSINESS: 'Business',
  /** Automated, no human actor. */
  SYSTEM: 'System',
  /** Exchanges with an external party. */
  INTEGRATION: 'Integration',
} as const;

export type AuditCategory = (typeof AuditCategory)[keyof typeof AuditCategory];

export type AuditOutcome = 'success' | 'failure';

/**
 * The single audit record shape used across all of NAFA.
 *
 * Every field except the identifying ones is optional so that a producer can
 * emit what it knows without inventing values — an audit trail with fabricated
 * data is worse than one with gaps.
 *
 * Ambient fields (actor, tenant, ip, device, channel, traceId) are filled from
 * the request context by the emitting service, not by each call site.
 */
export interface AuditEvent {
  /** Unique per event. Lets a consumer deduplicate on redelivery. */
  eventId: string;
  category: AuditCategory;
  /** What happened, in `domain.action` form, e.g. `actor.created`. */
  action: string;
  /** Entity type acted on, e.g. `Actor`. */
  entity?: string;
  entityId?: string;
  /** Who acted. Absent for anonymous or system events. */
  actorId?: string;
  tenantId?: string;
  ip?: string;
  device?: string;
  channel?: Channel;
  /** Ties the event to the distributed trace that produced it. */
  traceId?: string;
  correlationId?: string;
  requestId?: string;
  /** ISO 8601. */
  timestamp: string;
  outcome?: AuditOutcome;
  /** Why, when the outcome is a failure. */
  reason?: string;
  /**
   * Event-specific payload. Must be run through `redact` before being set:
   * audit records are long-lived and widely readable.
   */
  metadata?: UnknownRecord;
}

/** Ambient fields an emitter fills from the request context. */
export type AuditEventContext = Pick<
  AuditEvent,
  | 'actorId'
  | 'tenantId'
  | 'ip'
  | 'device'
  | 'channel'
  | 'traceId'
  | 'correlationId'
  | 'requestId'
>;

/** What a call site supplies: the parts only it knows. */
export type AuditEventInput = Omit<AuditEvent, 'eventId' | 'timestamp'> &
  Partial<Pick<AuditEvent, 'eventId' | 'timestamp'>>;

/**
 * Where audit events go.
 *
 * An interface rather than an implementation because the destination differs:
 * the application log in development, an append-only table or a queue in
 * production.
 *
 * Implementations must never throw: auditing an operation must not be able to
 * break the operation it describes.
 */
export abstract class AuditSink {
  abstract record(event: AuditEvent): void | Promise<void>;
}

/** Builds a complete event, filling the fields the caller left out. */
export function buildAuditEvent(
  input: AuditEventInput,
  context: AuditEventContext = {},
  generateId: () => string = () => crypto.randomUUID(),
): AuditEvent {
  return {
    ...context,
    ...input,
    eventId: input.eventId ?? generateId(),
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
}
