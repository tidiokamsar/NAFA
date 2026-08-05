/**
 * Rate limiting contracts.
 *
 * `@nafa/platform` declares throttling limits through `@nestjs/throttler`, but
 * its default storage is in-memory and therefore per-instance: with three
 * replicas a "100 requests per minute" limit really allows 300. These
 * interfaces describe the shared store that fixes it.
 */

export interface RateLimitConfig {
  /** Window length in seconds. */
  windowSeconds: number;
  /** Requests allowed per key per window. */
  limit: number;
  /** Namespace prefix, so several policies can share one Redis instance. */
  keyPrefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests consumed in the current window, including this one. */
  current: number;
  remaining: number;
  /** Seconds until the window resets — the value for `Retry-After`. */
  resetInSeconds: number;
}

/**
 * A counter store shared by every instance of a service.
 *
 * Implementations must make {@link consume} atomic: read-then-write races let
 * concurrent requests slip past the limit, which is exactly the traffic
 * pattern rate limiting exists to stop.
 */
export abstract class RateLimitStore {
  abstract consume(
    key: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult>;

  /** Clears a key. Used after a successful login to drop failure counters. */
  abstract reset(key: string): Promise<void>;
}

/** Builds the counter key. Defaults to prefix + identifier. */
export function rateLimitKey(identifier: string, prefix = 'rl'): string {
  return `${prefix}:${identifier}`;
}
