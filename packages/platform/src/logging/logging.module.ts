import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import type { LoggingConfig } from '../config/configuration';
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
} from './correlation.constants';

type Req = IncomingMessage & { id?: string; correlationId?: string };

/**
 * Structured JSON logging for every NAFA service.
 *
 * Each request gets a request id (reused from the inbound header when a proxy
 * or upstream service already assigned one) and a correlation id that is
 * echoed back on the response so a caller can stitch a trace together across
 * service boundaries. nestjs-pino stores both in AsyncLocalStorage, so any
 * log written during the request carries them without being passed around.
 */
@Module({})
export class PlatformLoggingModule {
  static forRoot(): DynamicModule {
    return {
      module: PlatformLoggingModule,
      imports: [
        LoggerModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const logging = config.get<LoggingConfig>('logging');
            const serviceName = config.get<string>('app.serviceName');

            return {
              pinoHttp: {
                level: logging?.level ?? 'info',
                base: { service: serviceName },

                genReqId: (req: IncomingMessage, res: ServerResponse) => {
                  const headers = req.headers;
                  const requestId =
                    (headers[REQUEST_ID_HEADER] as string | undefined) ??
                    randomUUID();
                  const correlationId =
                    (headers[CORRELATION_ID_HEADER] as string | undefined) ??
                    requestId;

                  (req as Req).correlationId = correlationId;
                  res.setHeader(REQUEST_ID_HEADER, requestId);
                  res.setHeader(CORRELATION_ID_HEADER, correlationId);
                  return requestId;
                },

                customProps: (req: IncomingMessage) => ({
                  correlationId: (req as Req).correlationId,
                }),

                // Health probes fire constantly; logging them buries real traffic.
                autoLogging: {
                  ignore: (req: IncomingMessage) =>
                    ['/health', '/ready', '/live'].includes(
                      (req.url ?? '').split('?')[0],
                    ),
                },

                redact: {
                  paths: [
                    'req.headers.authorization',
                    'req.headers.cookie',
                    'req.headers["set-cookie"]',
                    'res.headers["set-cookie"]',
                    'req.body.password',
                    'req.body.passwordHash',
                    'req.body.token',
                  ],
                  censor: '[redacted]',
                },

                // Pretty output is a developer convenience only: production
                // must stay newline-delimited JSON for log shipping.
                transport: logging?.pretty
                  ? {
                      target: 'pino-pretty',
                      options: {
                        singleLine: true,
                        translateTime: 'SYS:HH:MM:ss',
                      },
                    }
                  : undefined,
              },
            };
          },
        }),
      ],
      exports: [LoggerModule],
    };
  }
}
