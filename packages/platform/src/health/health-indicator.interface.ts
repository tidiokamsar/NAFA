import type { HealthIndicatorResult } from '@nestjs/terminus';

/**
 * A dependency a service needs before it can serve traffic.
 * Implementations live next to whatever they check (Prisma in the service,
 * Redis in this package) and are registered through
 * `PlatformHealthModule.forRoot({ indicators: [...] })`.
 */
export interface PlatformHealthIndicator {
  /** Key this indicator reports under, e.g. `postgres`. */
  readonly key: string;
  isHealthy(): Promise<HealthIndicatorResult>;
}

export const READINESS_INDICATORS = Symbol('READINESS_INDICATORS');
