import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import {
  RateLimitStore,
  rateLimitKey,
  type RateLimitConfig,
  type RateLimitResult,
} from './rate-limit.types';

/**
 * Injection token for the Redis connection this store uses.
 *
 * Declared here rather than imported from `@nafa/platform` so that
 * `@nafa/security` depends on no other NAFA package except `@nafa/shared`
 * (AR-0003). The consuming service binds it to whatever client it already has:
 *
 * ```ts
 * { provide: RATE_LIMIT_REDIS, useExisting: REDIS_CLIENT }
 * ```
 */
export const RATE_LIMIT_REDIS = Symbol('RATE_LIMIT_REDIS');

/**
 * Redis-backed fixed-window counter, shared across every replica.
 *
 * `INCR` + `EXPIRE` are issued in one pipeline so the increment and the TTL
 * cannot be separated by a crash, which would otherwise leave a key without
 * expiry and lock a caller out permanently. `INCR` is atomic, so concurrent
 * requests cannot both read the same pre-increment value.
 *
 * Fixed windows admit a burst of up to 2× the limit across a window boundary.
 * That is an accepted trade-off here: it is far cheaper than a sliding-window
 * log, and the goal is blocking abuse, not perfectly smooth pacing. Switch to
 * a sorted-set sliding window if that burst ever matters.
 */
@Injectable()
export class RedisRateLimitStore extends RateLimitStore {
  constructor(@Inject(RATE_LIMIT_REDIS) private readonly redis: Redis) {
    super();
  }

  async consume(
    key: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const fullKey = rateLimitKey(key, config.keyPrefix);

    const results = await this.redis
      .multi()
      .incr(fullKey)
      // NX only sets the TTL when the key has none, so the window starts on
      // the first request and is not pushed back by every later one.
      .expire(fullKey, config.windowSeconds, 'NX')
      .ttl(fullKey)
      .exec();

    if (!results) {
      // Redis unavailable: fail open. Rejecting every request would turn a
      // cache outage into a full outage, a worse failure than a brief window
      // without limits.
      return {
        allowed: true,
        current: 0,
        remaining: config.limit,
        resetInSeconds: config.windowSeconds,
      };
    }

    const current = Number(results[0]?.[1] ?? 0);
    const ttl = Number(results[2]?.[1] ?? config.windowSeconds);

    return {
      allowed: current <= config.limit,
      current,
      remaining: Math.max(0, config.limit - current),
      resetInSeconds: ttl > 0 ? ttl : config.windowSeconds,
    };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(rateLimitKey(key));
  }
}
