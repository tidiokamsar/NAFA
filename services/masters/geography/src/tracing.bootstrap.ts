/**
 * Imported first by main.ts, before anything else.
 *
 * OpenTelemetry patches libraries as they are required, so the SDK has to
 * start before NestJS, Prisma, ioredis or http are pulled in — otherwise
 * auto-instrumentation silently records nothing.
 */
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { startTracing } from '@nafa/platform';

loadEnv({ path: join(__dirname, '../../../../.env') });

if (process.env.OTEL_ENABLED !== 'false') {
  startTracing({
    serviceName: process.env.SERVICE_NAME ?? 'nafa-geography',
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    prometheusPort: Number(process.env.PROMETHEUS_PORT ?? 9464),
  });
}
