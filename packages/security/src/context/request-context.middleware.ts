import { Injectable, NestMiddleware } from '@nestjs/common';
import {
  ACCEPT_LANGUAGE_HEADER,
  CHANNEL_HEADER,
  CORRELATION_ID_HEADER,
  DEVICE_ID_HEADER,
  REQUEST_ID_HEADER,
  TENANT_ID_HEADER,
  TIMEZONE_HEADER,
  TRACE_ID_HEADER,
  USER_AGENT_HEADER,
  isChannel,
  type Channel,
} from '@nafa/shared';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { runWithRequestContext, type RequestContext } from './request-context';

/**
 * Opens a {@link RequestContext} for the lifetime of each request.
 *
 * Must be the first middleware registered: anything running before it sees no
 * context, so its logs and audit writes lose the request and correlation ids.
 *
 * ```ts
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(RequestContextMiddleware).forRoutes('*');
 *   }
 * }
 * ```
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const header = (name: string): string | undefined => {
      const value = req.headers[name];
      return Array.isArray(value) ? value[0] : value;
    };

    // Reuse the ids an upstream proxy or calling service already assigned, so
    // one transaction keeps one correlation id across every hop.
    const requestId = header(REQUEST_ID_HEADER) ?? randomUUID();
    const correlationId = header(CORRELATION_ID_HEADER) ?? requestId;
    const traceId = header(TRACE_ID_HEADER) ?? correlationId;

    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    res.setHeader(TRACE_ID_HEADER, traceId);

    const rawChannel = header(CHANNEL_HEADER);

    const context: RequestContext = {
      requestId,
      correlationId,
      traceId,
      ip: req.ip ?? req.socket?.remoteAddress,
      userAgent: header(USER_AGENT_HEADER),
      // An unrecognised channel is dropped rather than stored: audit records
      // should never carry a value the rest of the system cannot interpret.
      channel: isChannel(rawChannel) ? (rawChannel as Channel) : undefined,
      device: header(DEVICE_ID_HEADER),
      locale: header(ACCEPT_LANGUAGE_HEADER)?.split(',')[0]?.trim(),
      timezone: header(TIMEZONE_HEADER),
      headerTenantId: header(TENANT_ID_HEADER),
      startedAt: Date.now(),
    };

    runWithRequestContext(context, () => next());
  }
}
