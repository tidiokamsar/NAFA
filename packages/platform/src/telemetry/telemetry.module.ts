import { DynamicModule, Module } from '@nestjs/common';
import { OpenTelemetryModule } from 'nestjs-otel';

/**
 * Application-level OpenTelemetry wiring.
 *
 * Only host metrics are configured here: HTTP server metrics and spans come
 * from the OTel HTTP auto-instrumentation enabled in {@link startTracing},
 * which sees every request regardless of framework. (nestjs-otel v8 removed
 * its own `apiMetrics` option in favour of exactly that.)
 *
 * Export is configured separately in the SDK — this module only produces
 * signals, the SDK decides where they go.
 */
@Module({})
export class PlatformTelemetryModule {
  static forRoot(): DynamicModule {
    return {
      module: PlatformTelemetryModule,
      imports: [
        OpenTelemetryModule.forRoot({
          metrics: {
            hostMetrics: true,
          },
        }),
      ],
      exports: [OpenTelemetryModule],
    };
  }
}
