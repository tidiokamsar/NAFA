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
import { AuthModule } from './auth/auth.module';
import { PrismaHealthIndicator } from './health/prisma-health.indicator';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

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

    PrismaModule,

    PlatformHealthModule.forRoot({
      imports: [PrismaModule],
      indicators: [PrismaHealthIndicator, RedisHealthIndicator],
    }),

    UsersModule,
    AuthModule,
  ],
})
export class AppModule {}
