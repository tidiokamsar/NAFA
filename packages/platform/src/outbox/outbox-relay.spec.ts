import type { DomainEvent, DomainEventPublisher } from '@nafa/shared';
import {
  relayOnce,
  toDomainEvent,
  type ClaimedOutboxRow,
  type OutboxRelayClient,
  type OutboxRelayTransaction,
} from './outbox-relay';

function row(overrides: Partial<ClaimedOutboxRow> = {}): ClaimedOutboxRow {
  return {
    id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    eventType: 'actor.registered',
    aggregate: 'Actor',
    aggregateId: '660e8400-e29b-41d4-a716-446655440001',
    version: 1,
    occurredAt: '2026-09-07T09:00:00.000Z',
    payload: { nature: 'COMPANY' },
    tenantId: null,
    correlationId: null,
    causationId: null,
    attempts: 0,
    ...overrides,
  };
}

interface RecordedCall {
  readonly query: string;
  readonly values: unknown[];
}

/** A transaction handle that records what the relay asked it to run. */
function fakeClient(claimed: ClaimedOutboxRow[]): {
  client: OutboxRelayClient;
  queries: RecordedCall[];
  writes: RecordedCall[];
} {
  const queries: RecordedCall[] = [];
  const writes: RecordedCall[] = [];

  const tx: OutboxRelayTransaction = {
    async $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T> {
      queries.push({ query, values });
      return claimed as unknown as T;
    },
    async $executeRawUnsafe(
      query: string,
      ...values: unknown[]
    ): Promise<number> {
      writes.push({ query, values });
      return values.length;
    },
  };

  return {
    client: { $transaction: async (fn) => fn(tx) },
    queries,
    writes,
  };
}

function publisher(
  onPublish: (events: DomainEvent[]) => Promise<void> = async () => {},
): DomainEventPublisher {
  return {
    publish: async () => {},
    publishAll: onPublish,
  } as DomainEventPublisher;
}

describe('toDomainEvent', () => {
  it('rebuilds the event the domain emitted', () => {
    const event = toDomainEvent(row());

    // The row id is the event id, which is the whole point of ADR-0013 §2:
    // a relay that republishes and a consumer that deduplicates need one
    // identity, not two.
    expect(event.eventId).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    expect(event.eventType).toBe('actor.registered');
    expect(event.version).toBe(1);
  });

  it('turns null correlation columns back into absent fields', () => {
    const event = toDomainEvent(row());

    // Postgres stores NULL because it has no undefined, but `DomainEvent`
    // declares these optional. Handing a consumer `tenantId: null` when the
    // domain emitted nothing makes `if (event.tenantId)` lie about the shape.
    expect('tenantId' in event).toBe(false);
    expect('correlationId' in event).toBe(false);
    expect('causationId' in event).toBe(false);
  });

  it('keeps the correlation chain when the row carries one', () => {
    const event = toDomainEvent(
      row({ correlationId: 'req-42', causationId: 'evt-7', tenantId: 'gn' }),
    );

    expect(event.correlationId).toBe('req-42');
    expect(event.causationId).toBe('evt-7');
    expect(event.tenantId).toBe('gn');
  });
});

describe('relayOnce', () => {
  it('claims with FOR UPDATE SKIP LOCKED', async () => {
    const { client, queries } = fakeClient([]);

    await relayOnce(client, publisher());

    // Not cosmetic. It is what lets the four Masters poll one shared table at
    // once (ADR-0013 §1): without it they queue behind each other's locks.
    expect(queries[0].query).toContain('FOR UPDATE SKIP LOCKED');
    expect(queries[0].query).toContain('"publishedAt" IS NULL');
  });

  it('binds the limits rather than interpolating them', async () => {
    const { client, queries } = fakeClient([]);

    await relayOnce(client, publisher(), { batchSize: 7, maxAttempts: 3 });

    expect(queries[0].values).toEqual([3, 7]);
  });

  it('publishes nothing and writes nothing on an empty queue', async () => {
    const publishAll = jest.fn(async () => {});
    const { client, writes } = fakeClient([]);

    const result = await relayOnce(client, publisher(publishAll));

    expect(publishAll).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
    expect(result).toEqual({ claimed: 0, published: 0, failed: 0 });
  });

  it('publishes the claimed batch and marks it published', async () => {
    const published: DomainEvent[][] = [];
    const { client, writes } = fakeClient([row(), row({ id: 'second' })]);

    const result = await relayOnce(
      client,
      publisher(async (events) => {
        published.push(events);
      }),
    );

    expect(published[0]).toHaveLength(2);
    expect(writes[0].query).toContain('"publishedAt" = NOW()');
    expect(writes[0].values[0]).toEqual([
      '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      'second',
    ]);
    expect(result).toEqual({ claimed: 2, published: 2, failed: 0 });
  });

  it('clears lastError when a row finally publishes', async () => {
    const { client, writes } = fakeClient([row({ attempts: 2 })]);

    await relayOnce(client, publisher());

    // A row that failed twice and then succeeded must stop showing the old
    // error, or the column reads as a live fault forever after.
    expect(writes[0].query).toContain('"lastError" = NULL');
  });

  it('records a failed publication instead of throwing', async () => {
    const { client, writes } = fakeClient([row()]);

    const result = await relayOnce(
      client,
      publisher(async () => {
        throw new Error('broker unreachable');
      }),
    );

    // The subtle one. Rethrowing would roll the transaction back and take the
    // attempt counter with it, so the row would come back looking untouched
    // and the same failure would repeat forever. Committing the failure is
    // what gives `maxAttempts` any meaning at all.
    expect(writes[0].query).toContain('attempts = attempts + 1');
    expect(writes[0].values[1]).toBe('broker unreachable');
    expect(result).toEqual({ claimed: 1, published: 0, failed: 1 });
  });

  it('never marks a failed batch published', async () => {
    const { client, writes } = fakeClient([row()]);

    await relayOnce(
      client,
      publisher(async () => {
        throw new Error('broker unreachable');
      }),
    );

    // Marking a row published after handing it to nobody loses the event for
    // good: nothing will claim it again.
    expect(writes.some((w) => w.query.includes('"publishedAt" = NOW()'))).toBe(
      false,
    );
  });

  it('truncates a runaway error message', async () => {
    const { client, writes } = fakeClient([row()]);

    await relayOnce(
      client,
      publisher(async () => {
        throw new Error('x'.repeat(5000));
      }),
    );

    // lastError is for a human reading the table, not for a stack dump.
    expect((writes[0].values[1] as string).length).toBe(1000);
  });

  it('survives a thrown non-Error', async () => {
    const { client, writes } = fakeClient([row()]);

    const result = await relayOnce(
      client,
      publisher(async () => {
        throw 'a string, because transports do that';
      }),
    );

    expect(writes[0].values[1]).toBe('a string, because transports do that');
    expect(result.failed).toBe(1);
  });
});
