import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
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

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const requestId =
      request?.id ?? (request?.headers?.[REQUEST_ID_HEADER] as string);
    const correlationId =
      request?.correlationId ??
      (request?.headers?.[CORRELATION_ID_HEADER] as string);

    const body: ErrorResponse = {
      statusCode: status,
      error: this.errorName(status, exception),
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

  private errorName(status: number, exception: unknown): string {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null && 'error' in res) {
        return String((res as Record<string, unknown>).error);
      }
      return exception.name;
    }
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

    return 'Error';
  }
}
