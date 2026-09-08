import type { DomainEvent, DomainEventPublisher } from '@nafa/shared';
import type { OutboxRow } from './outbox';

/**
 * A row as the relay claims it back out of `outbox_events`.
 *
 * `attempts` is the only column the writer never sets and the relay always
 * reads: it is what separates a row nobody has tried yet from a poisoned one.
 */
export interface ClaimedOutboxRow extends OutboxRow {
  readonly attempts: number;
}

/**
 * The slice of a Prisma transaction handle the relay needs.
 *
 * Structural for the same reason as {@link OutboxCapableClient}: each service
 * generates its own client from the one schema, so five unrelated types
 * satisfy this shape and platform can name none of them.
 *
 * `$queryRawUnsafe` is the raw escape hatch, not an invitation to interpolate.
 * Every query below is a module-level constant and every value travels as a
 * bound parameter — the "unsafe" in the name is about the API, not about what
 * this file does with it.
 */
export interface OutboxRelayTransaction {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

export interface OutboxRelayClient {
  $transaction<T>(fn: (tx: OutboxRelayTransaction) => Promise<T>): Promise<T>;
}

export interface OutboxRelayOptions {
  /** Rows claimed per pass. Bounded because the claim holds row locks. */
  readonly batchSize: number;
  /** A row that failed this many times stops being claimed. */
  readonly maxAttempts: number;
}

export const DEFAULT_RELAY_OPTIONS: OutboxRelayOptions = {
  batchSize: 100,
  maxAttempts: 5,
};

export interface OutboxRelayResult {
  readonly claimed: number;
  readonly published: number;
  readonly failed: number;
}

/**
 * Claims the oldest unpublished rows, skipping any another relay already holds.
 *
 * `FOR UPDATE SKIP LOCKED` is what makes one shared table safe for four
 * services polling it at once (ADR-0013 §1): each pass takes rows nobody else
 * is working on rather than blocking behind them.
 *
 * `attempts < $1` is what keeps a poisoned row from being claimed forever.
 * It stays in the table, unpublished, with its `lastError` readable — which is
 * the point of the column.
 */
const CLAIM_BATCH = `
  SELECT id, "eventType", aggregate, "aggregateId", version, "occurredAt",
         payload, "tenantId", "correlationId", "causationId", attempts
  FROM outbox_events
  WHERE "publishedAt" IS NULL AND attempts < $1
  ORDER BY "createdAt"
  LIMIT $2
  FOR UPDATE SKIP LOCKED
`;

const MARK_PUBLISHED = `
  UPDATE outbox_events
  SET "publishedAt" = NOW(), "lastError" = NULL
  WHERE id = ANY($1::uuid[])
`;

const MARK_FAILED = `
  UPDATE outbox_events
  SET attempts = attempts + 1, "lastError" = $2
  WHERE id = ANY($1::uuid[])
`;

/** Rebuilds the event the domain emitted, from the row that carried it. */
export function toDomainEvent(row: ClaimedOutboxRow): DomainEvent {
  return {
    eventId: row.id,
    eventType: row.eventType,
    aggregate: row.aggregate,
    aggregateId: row.aggregateId,
    version: row.version,
    occurredAt: row.occurredAt,
    payload: row.payload as DomainEvent['payload'],
    // Back to absent, not null: the row stores NULL because Postgres has no
    // undefined, but `DomainEvent` declares these optional and a consumer
    // checking `if (event.tenantId)` should not meet a null it never emitted.
    ...(row.tenantId === null ? {} : { tenantId: row.tenantId }),
    ...(row.correlationId === null ? {} : { correlationId: row.correlationId }),
    ...(row.causationId === null ? {} : { causationId: row.causationId }),
  };
}

/** Keeps the error readable in `lastError` without storing a whole stack. */
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1000);
}

/**
 * One pass of the relay: claim, publish, record the outcome.
 *
 * Claim and publication share a transaction, so the row locks are held while
 * the transport is called. That is deliberate and it is the trade: the batch
 * is bounded, and the alternative — commit a claim, publish, commit again —
 * needs a lease column the schema does not have and would strand rows whenever
 * a relay dies between the two commits.
 *
 * Delivery is at-least-once. A publication that succeeds and a commit that
 * then fails will republish later, which is exactly why ADR-0008 requires
 * consumers to deduplicate on `eventId`.
 */
export async function relayOnce(
  client: OutboxRelayClient,
  publisher: DomainEventPublisher,
  options: OutboxRelayOptions = DEFAULT_RELAY_OPTIONS,
): Promise<OutboxRelayResult> {
  return client.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<ClaimedOutboxRow[]>(
      CLAIM_BATCH,
      options.maxAttempts,
      options.batchSize,
    );

    if (rows.length === 0) {
      return { claimed: 0, published: 0, failed: 0 };
    }

    const ids = rows.map((row) => row.id);

    try {
      await publisher.publishAll(rows.map(toDomainEvent));
    } catch (error) {
      // Swallowed on purpose, and this is the subtle part. Rethrowing would
      // roll the transaction back, which would undo the attempt counter along
      // with everything else — the row would come back looking untouched and
      // the same failure would repeat forever. Recording the failure and
      // letting the transaction commit is what makes `maxAttempts` mean
      // anything.
      await tx.$executeRawUnsafe(MARK_FAILED, ids, describe(error));
      return { claimed: rows.length, published: 0, failed: rows.length };
    }

    await tx.$executeRawUnsafe(MARK_PUBLISHED, ids);
    return { claimed: rows.length, published: rows.length, failed: 0 };
  });
}
