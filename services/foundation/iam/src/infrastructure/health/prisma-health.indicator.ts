import { Injectable, Scope } from '@nestjs/common';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import type { PlatformHealthIndicator } from '@nafa/platform';
import { PrismaService } from '../persistence/prisma/prisma.service';

@Injectable({ scope: Scope.TRANSIENT })
export class PrismaHealthIndicator implements PlatformHealthIndicator {
  readonly key = 'postgres';

  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  async isHealthy(): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(this.key);
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return indicator.up();
    } catch (error) {
      return indicator.down({ message: (error as Error).message });
    }
  }
}
