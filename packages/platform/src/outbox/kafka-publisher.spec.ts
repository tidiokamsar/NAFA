import type { DomainEvent } from '@nafa/shared';
import {
  KafkaDomainEventPublisher,
  toKafkaMessage,
  topicFor,
  type KafkaOutboxMessage,
  type KafkaProducerLike,
} from './kafka-publisher';

function event(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    eventId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    eventType: 'actor.registered',
    aggregate: 'Actor',
    aggregateId: '660e8400-e29b-41d4-a716-446655440001',
    version: 1,
    occurredAt: '2026-09-08T09:00:00.000Z',
    payload: { nature: 'COMPANY' },
    ...overrides,
  };
}

function fakeProducer(
  onSend: (messages: KafkaOutboxMessage[]) => Promise<void> = async () => {},
): KafkaProducerLike & { sent: KafkaOutboxMessage[][]; closed: number } {
  const sent: KafkaOutboxMessage[][] = [];
  let closed = 0;

  return {
    sent,
    get closed() {
      return closed;
    },
    async send({ messages }) {
      sent.push(messages);
      await onSend(messages);
      return undefined;
    },
    async close() {
      closed += 1;
    },
  };
}

const OPTIONS = {
  brokers: ['redpanda:29092'],
  clientId: 'nafa-test',
  topicPrefix: 'a.',
};

describe('topicFor', () => {
  it('lowercases the aggregate behind the lane prefix', () => {
    expect(topicFor(event(), 'a.')).toBe('a.actor');
  });

  it('accepts an empty prefix', () => {
    // A deployed environment owns its cluster; the prefix only exists to keep
    // two local lanes out of each other's topics.
    expect(topicFor(event())).toBe('actor');
  });

  it('separates aggregates into separate topics', () => {
    expect(topicFor(event({ aggregate: 'CountryProfile' }), 'a.')).toBe(
      'a.countryprofile',
    );
  });
});

describe('toKafkaMessage', () => {
  it('keys on the aggregate id', () => {
    // The load-bearing assertion of this file. Kafka orders within a
    // partition, so keying on the aggregate is what makes `version` verifiable
    // by a consumer. Key on eventId instead and ordering is gone.
    expect(toKafkaMessage(event(), 'a.').key).toBe(
      '660e8400-e29b-41d4-a716-446655440001',
    );
  });

  it('carries the whole event as the body', () => {
    const parsed = JSON.parse(
      toKafkaMessage(event(), 'a.').value,
    ) as DomainEvent;

    expect(parsed.eventId).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    expect(parsed.payload).toEqual({ nature: 'COMPANY' });
  });

  it('repeats identity and routing in the headers', () => {
    const { headers } = toKafkaMessage(event(), 'a.');

    // So a consumer can deduplicate or route without deserialising a payload
    // it may not even understand.
    expect(headers.eventId).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    expect(headers.eventType).toBe('actor.registered');
    expect(headers.version).toBe('1');
  });

  it('omits correlation headers the event does not carry', () => {
    const { headers } = toKafkaMessage(event(), 'a.');

    // An empty-string header is not the same as an absent one, and Kafka has
    // no null: leaving them out is the only honest encoding.
    expect('correlationId' in headers).toBe(false);
    expect('causationId' in headers).toBe(false);
    expect('tenantId' in headers).toBe(false);
  });

  it('carries the correlation chain when the event has one', () => {
    const { headers } = toKafkaMessage(
      event({ correlationId: 'req-42', causationId: 'evt-7', tenantId: 'gn' }),
      'a.',
    );

    expect(headers.correlationId).toBe('req-42');
    expect(headers.causationId).toBe('evt-7');
    expect(headers.tenantId).toBe('gn');
  });
});

describe('KafkaDomainEventPublisher', () => {
  it('sends nothing for an empty batch', async () => {
    const producer = fakeProducer();
    const publisher = new KafkaDomainEventPublisher(OPTIONS, producer);

    await publisher.publishAll([]);

    // A save that produced no event is ordinary, not an error, and must not
    // open a connection to say so.
    expect(producer.sent).toHaveLength(0);
  });

  it('sends the whole batch in one call', async () => {
    const producer = fakeProducer();
    const publisher = new KafkaDomainEventPublisher(OPTIONS, producer);

    await publisher.publishAll([event(), event({ eventId: 'second' })]);

    expect(producer.sent).toHaveLength(1);
    expect(producer.sent[0]).toHaveLength(2);
  });

  it('routes a mixed batch to one topic per aggregate', async () => {
    const producer = fakeProducer();
    const publisher = new KafkaDomainEventPublisher(OPTIONS, producer);

    await publisher.publishAll([
      event(),
      event({ eventId: 'geo', aggregate: 'AdministrativeArea' }),
    ]);

    expect(producer.sent[0].map((m) => m.topic)).toEqual([
      'a.actor',
      'a.administrativearea',
    ]);
  });

  it('propagates a send failure instead of swallowing it', async () => {
    const producer = fakeProducer(async () => {
      throw new Error('broker unreachable');
    });
    const publisher = new KafkaDomainEventPublisher(OPTIONS, producer);

    // The whole retry policy depends on this. `relayOnce` catches, increments
    // attempts and writes lastError; an adapter that reported success would
    // have those rows stamped `publishedAt` and the events lost for good.
    await expect(publisher.publishAll([event()])).rejects.toThrow(
      'broker unreachable',
    );
  });

  it('publish delegates to publishAll', async () => {
    const producer = fakeProducer();
    const publisher = new KafkaDomainEventPublisher(OPTIONS, producer);

    await publisher.publish(event());

    expect(producer.sent[0]).toHaveLength(1);
  });

  it('closes the producer on shutdown', async () => {
    const producer = fakeProducer();
    const publisher = new KafkaDomainEventPublisher(OPTIONS, producer);

    await publisher.onApplicationShutdown();

    // Closing flushes what is still buffered; dropping the process would lose
    // sends the relay was already told had succeeded.
    expect(producer.closed).toBe(1);
  });

  it('does not build a connection just to shut down', async () => {
    const publisher = new KafkaDomainEventPublisher(OPTIONS);

    // A service that imported the module but never published must not open a
    // socket to Kafka on its way out.
    await expect(publisher.onApplicationShutdown()).resolves.toBeUndefined();
  });
});
