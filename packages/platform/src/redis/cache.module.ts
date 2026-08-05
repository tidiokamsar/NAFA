import { CacheModule } from '@nestjs/cache-manager';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';
import type { RedisConfig } from '../config/configuration';

/**
 * Distributed cache backed by the same Redis instance as sessions.
 *
 * Registered globally so any service can inject `CACHE_MANAGER` or use
 * `@UseInterceptors(CacheInterceptor)` without re-importing anything.
 */
@Module({})
export class PlatformCacheModule {
  static forRoot(): DynamicModule {
    return {
      module: PlatformCacheModule,
      imports: [
        CacheModule.registerAsync({
          isGlobal: true,
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const redis = config.getOrThrow<RedisConfig>('redis');
            return {
              // cache-manager v7 expects TTL in milliseconds.
              ttl: redis.cacheTtlSeconds * 1000,
              stores: [new Keyv({ store: new KeyvRedis(redis.url) })],
            };
          },
        }),
      ],
      exports: [CacheModule],
    };
  }
}
