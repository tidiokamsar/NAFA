// Must stay the first import: it starts OpenTelemetry before any
// instrumented library is loaded.
import './tracing.bootstrap';

import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupSwagger, type AppConfig } from '@nafa/platform';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  setupSwagger(app, {
    title: 'NAFA — Geography Service',
    description:
      'Masters layer: administrative areas reference data, country profiles, and the import pipeline.',
    tags: [
      {
        name: 'geography',
        description: 'Administrative areas and country profiles',
      },
      { name: 'health', description: 'Liveness and readiness probes' },
    ],
  });

  const config = app.get(ConfigService);
  const { port } = config.getOrThrow<AppConfig>('app');
  await app.listen(port);
}

void bootstrap();
