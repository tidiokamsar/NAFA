import { DynamicModule, Module } from '@nestjs/common';
import { ConfigFactory, ConfigModule } from '@nestjs/config';
import { platformConfigurations } from './configuration';
import { validateEnv } from './env.validation';

export interface PlatformConfigOptions {
  /**
   * Extra `registerAs` namespaces contributed by the consuming service.
   */
  load?: ConfigFactory[];
}

/**
 * Environment files are read in order; the first match wins, so a
 * `.env.<NODE_ENV>.local` override never has to be merged by hand.
 * All of them sit at the repo root — one env surface for the whole monorepo.
 */
function envFilePaths(rootDir: string): string[] {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  return [
    `${rootDir}/.env.${nodeEnv}.local`,
    `${rootDir}/.env.${nodeEnv}`,
    `${rootDir}/.env.local`,
    `${rootDir}/.env`,
  ];
}

@Module({})
export class PlatformConfigModule {
  /**
   * @param rootDir absolute path to the repo root (where the .env files live)
   */
  static forRoot(
    rootDir: string,
    options: PlatformConfigOptions = {},
  ): DynamicModule {
    return {
      module: PlatformConfigModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          expandVariables: true,
          envFilePath: envFilePaths(rootDir),
          // `.env.test` is committed, so tests never depend on a developer's
          // local file being present.
          ignoreEnvFile: process.env.NODE_ENV === 'production',
          validate: validateEnv,
          load: [...platformConfigurations, ...(options.load ?? [])],
        }),
      ],
      exports: [ConfigModule],
    };
  }
}
