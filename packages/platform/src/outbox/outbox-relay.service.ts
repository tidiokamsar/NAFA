import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
// A VALUE import, not a type one. `DomainEventPublisher` is an abstract class
// used as a DI token, and a `type` import is erased at compile time, which
// leaves `emitDecoratorMetadata` recording `Function` and Nest with nothing to
// resolve. That failure typechecks and builds, and only shows when something
// boots the module (ADR-0014 §4).
import { DomainEventPublisher } from '@nafa/shared';
import {
  DEFAULT_RELAY_OPTIONS,
  relayOnce,
  type OutboxRelayClient,
  type OutboxRelayOptions,
  type OutboxRelayResult,
} from './outbox-relay';

export const OUTBOX_RELAY_CLIENT = Symbol('OUTBOX_RELAY_CLIENT');
export const OUTBOX_RELAY_OPTIONS = Symbol('OUTBOX_RELAY_OPTIONS');

export interface OutboxRelayRuntimeOptions extends OutboxRelayOptions {
  /** Pause between passes once the queue has been drained. */
  readonly pollIntervalMs: number;
}

export const DEFAULT_RELAY_RUNTIME_OPTIONS: OutboxRelayRuntimeOptions = {
  ...DEFAULT_RELAY_OPTIONS,
  pollIntervalMs: 1_000,
};

/**
 * Polls `outbox_events` and hands what it finds to the transport.
 *
 * Deliberately not `@nestjs/schedule`: the dependency is not in the repo, and
 * a cron expression is the wrong shape here anyway. The loop below reschedules
 * itself from the *end* of each pass, so a slow transport can never stack two
 * passes on top of each other the way a fixed interval would.
 */
@Injectable()
export class OutboxRelayService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<unknown> = Promise.resolve();
  private stopping = false;

  constructor(
    @Inject(OUTBOX_RELAY_CLIENT) private readonly client: OutboxRelayClient,
    private readonly publisher: DomainEventPublisher,
    @Inject(OUTBOX_RELAY_OPTIONS)
    private readonly options: OutboxRelayRuntimeOptions,
  ) {}

  onApplicationBootstrap(): void {
    // Bootstrap rather than module init: the transport may itself be a
    // provider that is not connected until the whole graph is up.
    this.schedule(0);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    // A pass in flight holds row locks. Dropping the process on top of it
    // would leave the transaction to be rolled back by the server; waiting
    // costs one batch and releases them cleanly.
    await this.inFlight;
  }

  /** One pass, exposed so a caller can drive the relay without the loop. */
  async relay(): Promise<OutboxRelayResult> {
    return relayOnce(this.client, this.publisher, this.options);
  }

  private schedule(delayMs: number): void {
    if (this.stopping) return;

    this.timer = setTimeout(() => {
      this.inFlight = this.tick();
    }, delayMs);

    // Never hold the process open on the relay's account. Whatever runs the
    // service — an HTTP server, a worker — decides when it exits.
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    try {
      const result = await this.relay();

      if (result.failed > 0) {
        this.logger.warn(
          `Outbox relay: ${result.failed} event(s) failed to publish`,
        );
      }

      // A full batch means there is almost certainly more behind it, so drain
      // rather than sleep. Anything less means the queue is caught up.
      this.schedule(
        result.claimed === this.options.batchSize
          ? 0
          : this.options.pollIntervalMs,
      );
    } catch (error) {
      // The pass itself failed: the database is unreachable, or the
      // transaction was aborted. Nothing was marked either way, so the rows
      // stay claimable. Back off and try again rather than spin.
      this.logger.error(
        `Outbox relay pass failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.schedule(this.options.pollIntervalMs);
    }
  }
}
