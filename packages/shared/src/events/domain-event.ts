import type { UnknownRecord } from '../types/primitives';

/**
 * Base shape for a domain event.
 *
 * Distinct from {@link AuditEvent}: an audit event records that something
 * happened, for people. A domain event *announces* it, for other parts of the
 * system to react to. The same action often produces both.
 *
 * `aggregateId` and `version` follow DDD: events belong to an aggregate and
 * carry the version they were emitted at, so a consumer can detect gaps and
 * order them.
 */
export interface DomainEvent<TPayload = UnknownRecord> {
  eventId: string;
  /** `<aggregate>.<past-tense verb>`, e.g. `actor.registered`. */
  eventType: string;
  /** Aggregate type, e.g. `Actor`. */
  aggregate: string;
  aggregateId: string;
  /** Aggregate version after this event. */
  version: number;
  /** ISO 8601 — when it happened, not when it was published. */
  occurredAt: string;
  tenantId?: string;
  /** Ties the event back to the request that caused it. */
  correlationId?: string;
  /** The event this one was emitted in reaction to, if any. */
  causationId?: string;
  payload: TPayload;
}

/** Handles one event type. */
export interface DomainEventHandler<TEvent extends DomainEvent = DomainEvent> {
  readonly eventType: string;
  handle(event: TEvent): Promise<void> | void;
}

/**
 * Publishes domain events.
 *
 * Interface only: whether events go to Kafka, RabbitMQ or an in-process bus is
 * an infrastructure decision, and the domain must not encode it.
 */
export abstract class DomainEventPublisher {
  abstract publish<T>(event: DomainEvent<T>): Promise<void>;
  abstract publishAll(events: DomainEvent[]): Promise<void>;
}

export interface DomainEventInput<TPayload = UnknownRecord> {
  eventType: string;
  aggregate: string;
  aggregateId: string;
  version: number;
  payload: TPayload;
  tenantId?: string;
  correlationId?: string;
  causationId?: string;
  occurredAt?: string;
  eventId?: string;
}

export function buildDomainEvent<TPayload>(
  input: DomainEventInput<TPayload>,
  generateId: () => string = () => crypto.randomUUID(),
): DomainEvent<TPayload> {
  return {
    ...input,
    eventId: input.eventId ?? generateId(),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };
}
