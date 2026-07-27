import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

export interface TracingOptions {
  serviceName: string;
  serviceVersion?: string;
  /** OTLP/HTTP collector endpoint. Traces are dropped when unset. */
  otlpEndpoint?: string;
  /** Port the Prometheus scrape endpoint listens on (`/metrics`). */
  prometheusPort: number;
}

let sdk: NodeSDK | undefined;

/**
 * Starts the OpenTelemetry SDK.
 *
 * MUST run before any instrumented library is imported, otherwise
 * auto-instrumentation cannot patch it — hence the dedicated bootstrap file
 * that services require at the very top of `main.ts`.
 *
 * Metrics are exposed on their own HTTP port rather than on the application
 * port: the exporter owns that server, and keeping it separate means metrics
 * stay scrapeable even when the app's own router is not yet listening.
 */
export function startTracing(options: TracingOptions): NodeSDK {
  if (sdk) return sdk;

  const prometheusExporter = new PrometheusExporter({
    port: options.prometheusPort,
    endpoint: '/metrics',
  });

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: options.serviceName,
      [ATTR_SERVICE_VERSION]: options.serviceVersion ?? '0.1.0',
    }),
    traceExporter: options.otlpEndpoint
      ? new OTLPTraceExporter({ url: `${options.otlpEndpoint}/v1/traces` })
      : undefined,
    metricReader: prometheusExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Noisy and rarely actionable; every file read would become a span.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  const shutdown = () => {
    void sdk
      ?.shutdown()
      .catch((error: unknown) =>
        console.error('OpenTelemetry shutdown failed', error),
      );
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  return sdk;
}

export async function stopTracing(): Promise<void> {
  await sdk?.shutdown();
  sdk = undefined;
}
