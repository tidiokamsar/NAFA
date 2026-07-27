import { Injectable, NestMiddleware } from '@nestjs/common';
import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER } from '@nafa/platform';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { runWithRequestContext, type RequestContext } from './request-context';

const LOCALE_HEADER = 'accept-language';
const TIMEZONE_HEADER = 'x-timezone';

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

    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    const context: RequestContext = {
      requestId,
      correlationId,
      ip: req.ip ?? req.socket?.remoteAddress,
      userAgent: header('user-agent'),
      locale: header(LOCALE_HEADER)?.split(',')[0]?.trim(),
      timezone: header(TIMEZONE_HEADER),
      startedAt: Date.now(),
    };

    runWithRequestContext(context, () => next());
  }
}
