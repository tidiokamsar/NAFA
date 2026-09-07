import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { NafaError } from '@nafa/shared';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
} from '../logging/correlation.constants';
import { ErrorResponse } from './error-response';

type RequestWithIds = Request & { id?: string; correlationId?: string };

/**
 * Catches everything that escapes a controller and turns it into the single
 * {@link ErrorResponse} shape.
 *
 * Two rules it enforces:
 *  - 5xx never leaks internals. The real error goes to the logs; the client
 *    gets a generic message plus the request id to quote in a bug report.
 *  - 4xx are logged at `warn`, 5xx at `error`, so alerting can key off level
 *    without parsing status codes.
 *
 * It understands two families. `HttpException` is what a controller throws
 * deliberately. `NafaError` is what the domain and the shared kernel raise,
 * and it already carries the answer: `ERROR_CODE_STATUS` maps its `code` to a
 * status, so a refused business rule becomes 422 and a stale write 409
 * without any service writing a mapper for it. Before this filter knew the
 * type, every one of those surfaced as a 500 with the code discarded — which
 * is how a well-modelled failure became indistinguishable from a crash.
 *
 * The `code` is echoed in the response so a client can branch on the rule
 * rather than on prose. `details` is deliberately NOT echoed: it carries
 * whatever the domain put there, and a filter is the wrong place to decide
 * what is safe to publish.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    @InjectPinoLogger(AllExceptionsFilter.name)
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestWithIds>();
    const response = ctx.getResponse<Response>();

    const status = this.statusOf(exception);

    const requestId =
      request?.id ?? (request?.headers?.[REQUEST_ID_HEADER] as string);
    const correlationId =
      request?.correlationId ??
      (request?.headers?.[CORRELATION_ID_HEADER] as string);

    const body: ErrorResponse = {
      statusCode: status,
      error: this.errorName(status, exception),
      code: exception instanceof NafaError ? exception.code : undefined,
      message: this.message(status, exception),
      path: httpAdapter.getRequestUrl(request) ?? '',
      timestamp: new Date().toISOString(),
      requestId,
      correlationId,
    };

    const logPayload = {
      statusCode: status,
      path: body.path,
      requestId,
      correlationId,
      err: exception,
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(logPayload, 'Unhandled exception');
    } else {
      this.logger.warn(logPayload, 'Request failed');
    }

    httpAdapter.reply(response, body, status);
  }

  private statusOf(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    // The domain already decided. A NafaError built as `violated(...)` carries
    // BUSINESS_RULE_VIOLATION, which ERROR_CODE_STATUS resolves to 422.
    if (exception instanceof NafaError) return exception.status;
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private errorName(status: number, exception: unknown): string {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null && 'error' in res) {
        return String((res as Record<string, unknown>).error);
      }
      return exception.name;
    }
    if (exception instanceof NafaError) return exception.code;
    return status >= HttpStatus.INTERNAL_SERVER_ERROR
      ? 'Internal Server Error'
      : 'Error';
  }

  private message(status: number, exception: unknown): string | string[] {
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return 'An unexpected error occurred. Quote the requestId when reporting it.';
    }

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') return res;
      if (typeof res === 'object' && res !== null && 'message' in res) {
        return (res as { message: string | string[] }).message;
      }
      return exception.message;
    }

    // Below 500 a NafaError's message is written for a caller — a refused
    // rule says which rule and why. Above it, the branch above has already
    // replaced it with the generic text.
    if (exception instanceof NafaError) return exception.message;

    return 'Error';
  }
}
