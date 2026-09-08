import {
  Module,
  type DynamicModule,
  type InjectionToken,
  type ModuleMetadata,
} from '@nestjs/common';
import {
  DEFAULT_RELAY_RUNTIME_OPTIONS,
  OutboxRelayService,
  OUTBOX_RELAY_CLIENT,
  OUTBOX_RELAY_OPTIONS,
  type OutboxRelayRuntimeOptions,
} from './outbox-relay.service';

export interface OutboxRelayModuleOptions {
  /**
   * Modules exporting the two things the relay cannot provide for itself: the
   * Prisma client under `clientToken`, and a `DomainEventPublisher`.
   */
  readonly imports?: ModuleMetadata['imports'];
  /** Existing provider token for this service's Prisma client. */
  readonly clientToken: InjectionToken;
  readonly options?: Partial<OutboxRelayRuntimeOptions>;
}

/**
 * Wires the relay into a service.
 *
 * There is deliberately no default transport. ADR-0013 leaves the transport to
 * the moment a consumer exists, and a module that shipped, say, a logging
 * adapter would mark rows `publishedAt` after handing them to nobody — turning
 * the one honest column in the table into a lie.
 *
 * So importing this module without providing a `DomainEventPublisher` fails at
 * boot, loudly. A service with nowhere to publish should not import it at all:
 * rows accumulating with `publishedAt IS NULL` is the correct, queryable state
 * ADR-0013 §"Non décisions" describes, not an outage.
 */
@Module({})
export class OutboxRelayModule {
  static forRoot(config: OutboxRelayModuleOptions): DynamicModule {
    return {
      module: OutboxRelayModule,
      imports: config.imports ?? [],
      providers: [
        {
          provide: OUTBOX_RELAY_CLIENT,
          useExisting: config.clientToken,
        },
        {
          provide: OUTBOX_RELAY_OPTIONS,
          useValue: {
            ...DEFAULT_RELAY_RUNTIME_OPTIONS,
            ...config.options,
          } satisfies OutboxRelayRuntimeOptions,
        },
        OutboxRelayService,
      ],
      exports: [OutboxRelayService],
    };
  }
}
