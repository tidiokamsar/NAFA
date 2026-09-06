import { Module } from '@nestjs/common';
import {
  PlatformCacheModule,
  PlatformConfigModule,
  PlatformErrorsModule,
  PlatformHealthModule,
  PlatformLoggingModule,
  PlatformRedisModule,
  PlatformTelemetryModule,
  PlatformThrottlerModule,
  RedisHealthIndicator,
} from '@nafa/platform';
import { join } from 'node:path';
import { PrismaHealthIndicator } from './infrastructure/health/prisma-health.indicator';
import { InfrastructureModule } from './infrastructure/infrastructure.module';

// Repo root, where the .env files live.
const REPO_ROOT = join(__dirname, '../../../..');

@Module({
  imports: [
    // Config first: every module below reads from it.
    PlatformConfigModule.forRoot(REPO_ROOT),
    PlatformLoggingModule.forRoot(),
    PlatformTelemetryModule.forRoot(),
    PlatformErrorsModule,
    PlatformRedisModule,
    PlatformCacheModule.forRoot(),
    PlatformThrottlerModule.forRoot(),

    InfrastructureModule,

    PlatformHealthModule.forRoot({
      imports: [InfrastructureModule],
      indicators: [PrismaHealthIndicator, RedisHealthIndicator],
    }),
  ],
})
export class AppModule {}
