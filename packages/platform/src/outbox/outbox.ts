import type { DomainEvent } from '@nafa/shared';

/**
 * The row shape `outbox_events` expects.
 *
 * Mirrors the Prisma model without importing a generated client: platform is
 * `layer:platform` and there are five of those clients, one per service.
 */
export interface OutboxRow {
  readonly id: string;
  readonly eventType: string;
  readonly aggregate: string;
  readonly aggregateId: string;
  readonly version: number;
  readonly occurredAt: string;
  readonly payload: unknown;
  readonly tenantId: string | null;
  readonly correlationId: string | null;
  readonly causationId: string | null;
}

/**
 * The slice of a Prisma client — or of a transaction handle — that appending
 * needs.
 *
 * Structural rather than nominal on purpose: each service generates its own
 * client from the one schema, so five unrelated types satisfy this shape and
 * none of them can be named here.
 */
export interface OutboxCapableClient<TRow = unknown> {
  readonly outboxEvent: {
    createMany(args: { data: TRow[] }): Promise<unknown>;
  };
}

/** Turns a domain event into the row that carries it. */
export function toOutboxRow(event: DomainEvent): OutboxRow {
  return {
    // The event's own id becomes the primary key, so a relay that
    // republishes and a consumer that deduplicates agree on one identity.
    id: event.eventId,
    eventType: event.eventType,
    aggregate: event.aggregate,
    aggregateId: event.aggregateId,
    version: event.version,
    occurredAt: event.occurredAt,
    payload: event.payload,
    tenantId: event.tenantId ?? null,
    correlationId: event.correlationId ?? null,
    causationId: event.causationId ?? null,
  };
}

/**
 * Writes drained domain events into the outbox.
 *
 * Must be called with a **transaction handle**, inside the same transaction
 * as the aggregate's own write. That is the whole point of ADR-0008: a
 * successful write followed by a failed publication loses the event, and the
 * reverse order announces a write that never landed. Passing the plain client
 * compiles and silently gives up that guarantee — the repository is the only
 * place that can get this right, which is why every one of them is asserted
 * by `outbox-drain.spec.ts`.
 *
 * A no-op for an empty array: a save that produced no event is ordinary, not
 * an error.
 */
export async function appendToOutbox<TRow>(
  tx: OutboxCapableClient<TRow>,
  events: readonly DomainEvent[],
): Promise<void> {
  if (events.length === 0) return;

  // The one cast in this file, and the reason it is here rather than spread
  // across six repositories: `payload` is `unknown` on this side of the
  // boundary and Prisma's `InputJsonValue` on the other. Platform cannot name
  // that type — there are five generated clients and it depends on none of
  // them — so the row type is inferred from the caller's client and the
  // conversion happens once, where the mismatch is visible.
  await tx.outboxEvent.createMany({
    data: events.map(toOutboxRow) as unknown as TRow[],
  });
}
