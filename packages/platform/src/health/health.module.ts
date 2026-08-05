import { DynamicModule, Module, ModuleMetadata, Type } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import {
  PlatformHealthIndicator,
  READINESS_INDICATORS,
} from './health-indicator.interface';

export interface PlatformHealthOptions {
  /** Indicator classes to run on /ready and /health. */
  indicators: Type<PlatformHealthIndicator>[];
  /** Modules exporting the providers those indicators depend on. */
  imports?: ModuleMetadata['imports'];
}

@Module({})
export class PlatformHealthModule {
  static forRoot(options: PlatformHealthOptions): DynamicModule {
    const { indicators, imports = [] } = options;

    return {
      module: PlatformHealthModule,
      imports: [TerminusModule, ...imports],
      controllers: [HealthController],
      providers: [
        ...indicators,
        {
          provide: READINESS_INDICATORS,
          useFactory: (...instances: PlatformHealthIndicator[]) => instances,
          inject: indicators,
        },
      ],
    };
  }
}
