import { DEFAULT_RETENTION_OPTIONS, purgePublished } from './outbox-retention';
import type { OutboxRelayClient, OutboxRelayTransaction } from './outbox-relay';

interface RecordedCall {
  readonly query: string;
  readonly values: unknown[];
}

function fakeClient(deleted = 0): {
  client: OutboxRelayClient;
  writes: RecordedCall[];
} {
  const writes: RecordedCall[] = [];

  const tx: OutboxRelayTransaction = {
    async $queryRawUnsafe<T>(): Promise<T> {
      throw new Error('the purge must not read rows back');
    },
    async $executeRawUnsafe(
      query: string,
      ...values: unknown[]
    ): Promise<number> {
      writes.push({ query, values });
      return deleted;
    },
  };

  return { client: { $transaction: async (fn) => fn(tx) }, writes };
}

const NOW = new Date('2026-09-09T12:00:00.000Z');

describe('purgePublished', () => {
  it('only ever deletes rows that were published', async () => {
    const { client, writes } = fakeClient();

    await purgePublished(client, NOW);

    // The load-bearing assertion of this file. A row with publishedAt NULL
    // that exhausted maxAttempts is the only trace of an event that reached
    // nobody; deleting it turns a loud failure into silence.
    expect(writes[0].query).toContain('"publishedAt" IS NOT NULL');
  });

  it('never touches a poisoned row, whatever its age', async () => {
    const { client, writes } = fakeClient();

    await purgePublished(client, NOW, {
      retentionMs: 0,
      batchSize: 1_000,
    });

    // Even with the window closed to zero, the filter is on publication and
    // not on age alone: a row that failed a year ago still stays.
    expect(writes[0].query).toContain('"publishedAt" IS NOT NULL');
    expect(writes[0].query).not.toContain('attempts');
  });

  it('computes the cutoff from the retention window', async () => {
    const { client, writes } = fakeClient();

    await purgePublished(client, NOW, {
      retentionMs: 24 * 60 * 60 * 1_000,
      batchSize: 500,
    });

    expect(writes[0].values[0]).toEqual(new Date('2026-09-08T12:00:00.000Z'));
  });

  it('bounds the batch rather than locking the whole table', async () => {
    const { client, writes } = fakeClient();

    await purgePublished(client, NOW, { retentionMs: 1_000, batchSize: 42 });

    // A purge that has fallen behind deletes a bounded slice per pass instead
    // of taking one long lock over everything it has to catch up on.
    expect(writes[0].query).toContain('LIMIT $2');
    expect(writes[0].values[1]).toBe(42);
  });

  it('binds the cutoff instead of interpolating it', async () => {
    const { client, writes } = fakeClient();

    await purgePublished(client, NOW);

    expect(writes[0].query).toContain('$1');
    expect(writes[0].values).toHaveLength(2);
  });

  it('reports how many rows went', async () => {
    const { client } = fakeClient(17);

    await expect(purgePublished(client, NOW)).resolves.toBe(17);
  });

  it('keeps a published row for seven days by default', () => {
    // Long enough to investigate an incident against the rows that carried it,
    // short enough to bound a table nobody watches.
    expect(DEFAULT_RETENTION_OPTIONS.retentionMs).toBe(
      7 * 24 * 60 * 60 * 1_000,
    );
  });
});
