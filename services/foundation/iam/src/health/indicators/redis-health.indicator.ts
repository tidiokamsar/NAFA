import { Inject, Injectable, Scope } from '@nestjs/common';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';

@Injectable({ scope: Scope.TRANSIENT })
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async check(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG'
        ? indicator.up()
        : indicator.down({ message: `unexpected ping reply: ${pong}` });
    } catch (error) {
      return indicator.down({ message: (error as Error).message });
    }
  }
}
