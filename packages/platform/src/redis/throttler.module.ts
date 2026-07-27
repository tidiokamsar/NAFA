import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import type { RateLimitConfig } from '../config/configuration';

/**
 * Rate limiting, wired but not enforced.
 *
 * Importing this module registers the limits; it does NOT install
 * `ThrottlerGuard` globally. A service opts in per controller/route with
 * `@UseGuards(ThrottlerGuard)`, or globally with an `APP_GUARD` provider once
 * it has decided its policy.
 *
 * The default in-memory storage is per-instance, which under-counts as soon as
 * a service runs more than one replica. Swap in `@nest-lab/throttler-storage-redis`
 * (or equivalent) before relying on these limits in production.
 */
@Module({})
export class PlatformThrottlerModule {
  static forRoot(): DynamicModule {
    return {
      module: PlatformThrottlerModule,
      imports: [
        ThrottlerModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const rateLimit = config.getOrThrow<RateLimitConfig>('rateLimit');
            return {
              throttlers: [
                {
                  name: 'default',
                  ttl: rateLimit.ttlSeconds * 1000,
                  limit: rateLimit.limit,
                },
              ],
            };
          },
        }),
      ],
      exports: [ThrottlerModule],
    };
  }
}
