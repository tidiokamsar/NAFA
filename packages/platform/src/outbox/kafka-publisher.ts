import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
// A VALUE import, not a type one. `DomainEventPublisher` is an abstract class
// used as a DI token, and a `type` import is erased at compile time, which
// leaves `emitDecoratorMetadata` recording `Function` and Nest with nothing to
// resolve (ADR-0014 §4).
import { DomainEventPublisher } from '@nafa/shared';
import type { DomainEvent } from '@nafa/shared';
// `@platformatic/kafka` is ESM-only. Node loads it from CommonJS through
// `require(esm)` (Node >= 22.12), and TypeScript resolves its types, but Jest
// runs CommonJS and cannot parse it: a static import here fails the whole
// suite before a single test runs. It is therefore imported lazily, inside
// the one method that needs a real connection — which the tests never reach,
// since they inject a producer.

export interface KafkaPublisherOptions {
  /** `host:port` list. The dev stack advertises `redpanda:29092` inside the
   * compose network and `localhost:9092` from the host. */
  readonly brokers: readonly string[];
  /** Identifies this producer to the broker; shows up in Redpanda's console. */
  readonly clientId: string;
  /**
   * Prepended to every topic name. `PARALLEL-AGENTS.md` gives each lane its
   * own prefix so two agents publishing at once cannot land in the same topic.
   * Empty is legitimate — a deployed environment owns its cluster.
   */
  readonly topicPrefix?: string;
}

/** The message shape handed to the client, kept separate so it can be asserted. */
export interface KafkaOutboxMessage {
  readonly topic: string;
  readonly key: string;
  readonly value: string;
  readonly headers: Record<string, string>;
}

/** The slice of the Kafka producer this adapter uses. */
export interface KafkaProducerLike {
  send(options: { messages: KafkaOutboxMessage[] }): Promise<unknown>;
  close(): Promise<void>;
}

/**
 * One topic per aggregate type, lowercased, behind the lane prefix:
 * `Actor` becomes `a.actor`. A consumer that cares about one Master
 * subscribes to one topic instead of filtering the whole stream.
 */
export function topicFor(event: DomainEvent, prefix = ''): string {
  return `${prefix}${event.aggregate.toLowerCase()}`;
}

/**
 * Turns a domain event into the record that carries it.
 *
 * The key is `aggregateId`, and that is the load-bearing decision: Kafka
 * orders messages within a partition, and keying on the aggregate puts every
 * event of one aggregate on the same one. That is exactly the ordering
 * `version` lets a consumer verify. Nothing orders events *between*
 * aggregates, and ADR-0015 never promised it would.
 *
 * The headers repeat what the body already holds so a consumer can deduplicate
 * on `eventId` or route on `eventType` without deserialising the payload.
 */
export function toKafkaMessage(
  event: DomainEvent,
  prefix = '',
): KafkaOutboxMessage {
  const headers: Record<string, string> = {
    eventId: event.eventId,
    eventType: event.eventType,
    aggregate: event.aggregate,
    version: String(event.version),
    occurredAt: event.occurredAt,
  };

  if (event.correlationId) headers.correlationId = event.correlationId;
  if (event.causationId) headers.causationId = event.causationId;
  if (event.tenantId) headers.tenantId = event.tenantId;

  return {
    topic: topicFor(event, prefix),
    key: event.aggregateId,
    value: JSON.stringify(event),
    headers,
  };
}

/**
 * Publishes drained outbox events to Kafka (ADR-0016).
 *
 * Deliberately throws on failure rather than swallowing. `relayOnce` catches,
 * increments `attempts` and writes `lastError` inside the transaction that
 * claimed the rows; an adapter that reported success on a failed send would
 * have those rows marked `publishedAt` and the events lost for good.
 */
@Injectable()
export class KafkaDomainEventPublisher
  extends DomainEventPublisher
  implements OnApplicationShutdown
{
  private readonly logger = new Logger(KafkaDomainEventPublisher.name);
  private producer: KafkaProducerLike | undefined;

  constructor(
    private readonly options: KafkaPublisherOptions,
    /** Injected in tests. Left undefined, the real client is built on first use. */
    producer?: KafkaProducerLike,
  ) {
    super();
    this.producer = producer;
  }

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    await this.publishAll([event as DomainEvent]);
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;

    const messages = events.map((event) =>
      toKafkaMessage(event, this.options.topicPrefix ?? ''),
    );

    const producer = await this.connection();
    await producer.send({ messages });
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.producer === undefined) return;
    // Closing flushes what is still buffered. Dropping the process instead
    // would lose sends the relay has already been told succeeded.
    await this.producer.close();
    this.producer = undefined;
  }

  private async connection(): Promise<KafkaProducerLike> {
    if (this.producer !== undefined) return this.producer;

    this.logger.log(
      `Connecting to Kafka at ${this.options.brokers.join(', ')}`,
    );

    const { Producer, stringSerializers } = await import('@platformatic/kafka');

    this.producer = new Producer<string, string, string, string>({
      clientId: this.options.clientId,
      bootstrapBrokers: [...this.options.brokers],
      serializers: stringSerializers,
      // The producer deduplicates its own retries broker-side, so a resend
      // after a network blip does not double the event. Delivery from the
      // outbox stays at-least-once regardless: the relay can republish a batch
      // whose transaction failed to commit, which is why ADR-0008 requires
      // consumers to deduplicate on `eventId`.
      idempotent: true,
      acks: -1,
    }) as unknown as KafkaProducerLike;

    return this.producer;
  }
}
