import type { OutboxRelayClient } from './outbox-relay';

export interface OutboxRetentionOptions {
  /** How long a published row is kept before it becomes purgeable. */
  readonly retentionMs: number;
  /** Rows deleted per pass, so one purge cannot lock the table for long. */
  readonly batchSize: number;
}

export const DEFAULT_RETENTION_OPTIONS: OutboxRetentionOptions = {
  // Seven days. Long enough to investigate an incident against the rows that
  // carried it, short enough to bound a table nobody watches. A published
  // event also lives in the broker, with its own retention: this copy is an
  // audit trail, not the last one standing.
  retentionMs: 7 * 24 * 60 * 60 * 1_000,
  batchSize: 1_000,
};

/**
 * Deletes rows that were published longer ago than the retention window.
 *
 * `publishedAt IS NOT NULL` is the whole safety of this statement, and it is
 * not a detail. A row that was never published — one that exhausted
 * `maxAttempts` and sits there with `lastError` — is the *only* trace of an
 * event that reached nobody. Deleting it would turn a loud, queryable failure
 * into silence, which is exactly the failure mode ADR-0008 warned about and
 * ADR-0013 built the unique index to avoid. Poisoned rows are a bug to fix,
 * not garbage to collect, and their count is the signal that says so.
 *
 * The subquery bounds the batch: a purge that has fallen behind deletes a
 * thousand rows per pass rather than taking one long lock over everything.
 */
const PURGE_PUBLISHED = `
  DELETE FROM outbox_events
  WHERE id IN (
    SELECT id
    FROM outbox_events
    WHERE "publishedAt" IS NOT NULL AND "publishedAt" < $1
    ORDER BY "publishedAt"
    LIMIT $2
  )
`;

/**
 * One purge pass. Returns how many rows went.
 *
 * Uses the same index the relay does — `(publishedAt, createdAt)`, already on
 * the table since ADR-0013 — so this needs no schema change of its own.
 */
export async function purgePublished(
  client: OutboxRelayClient,
  now: Date,
  options: OutboxRetentionOptions = DEFAULT_RETENTION_OPTIONS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - options.retentionMs);

  return client.$transaction(async (tx) =>
    tx.$executeRawUnsafe(PURGE_PUBLISHED, cutoff, options.batchSize),
  );
}
