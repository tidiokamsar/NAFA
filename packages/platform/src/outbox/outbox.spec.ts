import type { DomainEvent } from '@nafa/shared';
import { appendToOutbox, toOutboxRow, type OutboxRow } from './outbox';

function event(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    eventId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    eventType: 'actor.registered',
    aggregate: 'Actor',
    aggregateId: '660e8400-e29b-41d4-a716-446655440001',
    version: 1,
    occurredAt: '2026-09-07T09:00:00.000Z',
    payload: { nature: 'COMPANY' },
    ...overrides,
  };
}

describe('toOutboxRow', () => {
  it('makes the event id the row id', () => {
    // Not a detail: a relay that republishes and a consumer that
    // deduplicates have to agree on one identity, and this is where they do.
    expect(toOutboxRow(event()).id).toBe(
      '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    );
  });

  it('turns absent correlation fields into null, not undefined', () => {
    const row = toOutboxRow(event());

    // Postgres has no undefined. Leaving them out would make Prisma skip the
    // columns rather than write NULL, which reads the same until someone
    // queries for them.
    expect(row.tenantId).toBeNull();
    expect(row.correlationId).toBeNull();
    expect(row.causationId).toBeNull();
  });

  it('keeps the correlation chain when it is there', () => {
    const row = toOutboxRow(
      event({
        correlationId: '770e8400-e29b-41d4-a716-446655440002',
        causationId: '880e8400-e29b-41d4-a716-446655440003',
        tenantId: 'gn',
      }),
    );

    expect(row.correlationId).toBe('770e8400-e29b-41d4-a716-446655440002');
    expect(row.causationId).toBe('880e8400-e29b-41d4-a716-446655440003');
    expect(row.tenantId).toBe('gn');
  });

  it('carries occurredAt from the domain, untouched', () => {
    // When it happened, never when it was written. A relay that stamped its
    // own time would make every event look simultaneous after an outage.
    expect(toOutboxRow(event()).occurredAt).toBe('2026-09-07T09:00:00.000Z');
  });
});

describe('appendToOutbox', () => {
  function spyClient() {
    const calls: { data: OutboxRow[] }[] = [];
    return {
      calls,
      client: {
        outboxEvent: {
          createMany(args: { data: OutboxRow[] }): Promise<unknown> {
            calls.push(args);
            return Promise.resolve(undefined);
          },
        },
      },
    };
  }

  it('writes one row per event, in order', async () => {
    const { calls, client } = spyClient();

    await appendToOutbox(client, [
      event({ version: 1 }),
      event({ eventId: 'b', eventType: 'actor.verified', version: 2 }),
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0].data.map((r) => r.version)).toEqual([1, 2]);
    expect(calls[0].data.map((r) => r.eventType)).toEqual([
      'actor.registered',
      'actor.verified',
    ]);
  });

  it('does nothing at all for an empty buffer', async () => {
    const { calls, client } = spyClient();

    await appendToOutbox(client, []);

    // A save that produced no event is ordinary. Issuing an empty createMany
    // would be a wasted round trip on every read-only-ish write.
    expect(calls).toHaveLength(0);
  });
});
