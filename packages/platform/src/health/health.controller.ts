import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import {
  PlatformHealthIndicator,
  READINESS_INDICATORS,
} from './health-indicator.interface';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    @Inject(READINESS_INDICATORS)
    private readonly indicators: PlatformHealthIndicator[],
  ) {}

  /**
   * Liveness: is the process itself still working? Deliberately checks no
   * dependency — a failing database must not get the container killed and
   * restarted, which would only add load while the database recovers.
   */
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe — process is running' })
  live() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness: can this instance serve traffic right now? Returns 503 when a
   * dependency is down so the orchestrator stops routing to it.
   */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — dependencies reachable' })
  @HealthCheck()
  ready() {
    return this.health.check(
      this.indicators.map((indicator) => () => indicator.isHealthy()),
    );
  }

  /** Detailed report, intended for humans and dashboards. */
  @Get('health')
  @ApiOperation({ summary: 'Full health report' })
  @HealthCheck()
  health_() {
    return this.health.check(
      this.indicators.map((indicator) => () => indicator.isHealthy()),
    );
  }
}
