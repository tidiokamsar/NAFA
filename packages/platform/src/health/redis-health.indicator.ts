import { Inject, Injectable, Scope } from '@nestjs/common';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { PlatformHealthIndicator } from './health-indicator.interface';

@Injectable({ scope: Scope.TRANSIENT })
export class RedisHealthIndicator implements PlatformHealthIndicator {
  readonly key = 'redis';

  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async isHealthy(): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(this.key);
    try {
      const reply = await this.redis.ping();
      return reply === 'PONG'
        ? indicator.up()
        : indicator.down({ message: `unexpected ping reply: ${reply}` });
    } catch (error) {
      return indicator.down({ message: (error as Error).message });
    }
  }
}
