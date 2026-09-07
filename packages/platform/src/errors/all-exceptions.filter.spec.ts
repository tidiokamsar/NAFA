import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, HttpServer } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import type { PinoLogger } from 'nestjs-pino';
import { ErrorCode, NafaError } from '@nafa/shared';
import { AllExceptionsFilter } from './all-exceptions.filter';
import type { ErrorResponse } from './error-response';

/** A domain failure, built the way the Masters build theirs. */
class RuleViolation extends NafaError {
  constructor(code: ErrorCode, message: string) {
    super(code, message, { details: { rule: 'A_RULE' } });
  }
}

interface Reply {
  readonly body: ErrorResponse;
  readonly status: number;
}

function runFilter(exception: unknown): {
  reply: Reply;
  warned: unknown[][];
  errored: unknown[][];
} {
  const replies: Reply[] = [];
  const httpAdapter = {
    reply: (_res: unknown, body: ErrorResponse, status: number) => {
      replies.push({ body, status });
    },
    getRequestUrl: () => '/products/E2A',
  } as unknown as HttpServer;

  const warned: unknown[][] = [];
  const errored: unknown[][] = [];
  const logger = {
    warn: (...args: unknown[]) => warned.push(args),
    error: (...args: unknown[]) => errored.push(args),
  } as unknown as PinoLogger;

  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: 'req-1', correlationId: 'corr-1', headers: {} }),
      getResponse: () => ({}),
    }),
  } as unknown as ArgumentsHost;

  const filter = new AllExceptionsFilter(
    { httpAdapter } as unknown as HttpAdapterHost,
    logger,
  );
  filter.catch(exception, host);

  return { reply: replies[0], warned, errored };
}

describe('an HttpException, thrown deliberately by a controller', () => {
  it('keeps its status and its message', () => {
    const { reply } = runFilter(
      new BadRequestException('email must be an email'),
    );

    expect(reply.status).toBe(400);
    expect(reply.body.message).toBe('email must be an email');
  });

  it('carries no domain code, because it has none', () => {
    const { reply } = runFilter(
      new HttpException('nope', HttpStatus.FORBIDDEN),
    );

    expect(reply.body.code).toBeUndefined();
  });
});

describe('a NafaError, raised by the domain', () => {
  // The reason this filter changed. Before it knew the type, every one of
  // these surfaced as a 500 with the code discarded, which made a
  // well-modelled refusal indistinguishable from a crash.

  it('becomes 422 for a refused business rule', () => {
    const { reply } = runFilter(
      new RuleViolation(
        ErrorCode.BUSINESS_RULE_VIOLATION,
        'A closed actor cannot be verified further.',
      ),
    );

    expect(reply.status).toBe(422);
    expect(reply.body.message).toBe(
      'A closed actor cannot be verified further.',
    );
  });

  it('becomes 409 for a stale write', () => {
    const { reply } = runFilter(
      new RuleViolation(ErrorCode.STALE_VERSION, 'Offer moved under you.'),
    );

    expect(reply.status).toBe(409);
  });

  it('becomes 404 when the domain says not found', () => {
    const { reply } = runFilter(
      new RuleViolation(ErrorCode.NOT_FOUND, 'No product with code E2A.'),
    );

    expect(reply.status).toBe(404);
  });

  it('echoes the code so a client branches on the rule, not on prose', () => {
    const { reply } = runFilter(
      new RuleViolation(ErrorCode.INVALID_STATE_TRANSITION, 'Cannot publish.'),
    );

    expect(reply.body.code).toBe('INVALID_STATE_TRANSITION');
    expect(reply.status).toBe(422);
  });

  it('does not echo details', () => {
    // The domain puts whatever it likes in `details`. A filter is the wrong
    // place to decide what is safe to publish.
    const { reply } = runFilter(
      new RuleViolation(ErrorCode.VALIDATION_FAILED, 'Bad shape.'),
    );

    expect(reply.body).not.toHaveProperty('details');
  });

  it('is logged as a warning, not an error', () => {
    const { warned, errored } = runFilter(
      new RuleViolation(ErrorCode.BUSINESS_RULE_VIOLATION, 'Refused.'),
    );

    // A refused rule is the system working. Alerting keys off level.
    expect(warned).toHaveLength(1);
    expect(errored).toHaveLength(0);
  });
});

describe('anything else', () => {
  it('is a 500 that says nothing about itself', () => {
    const { reply } = runFilter(new Error('connection string: postgres://…'));

    expect(reply.status).toBe(500);
    expect(reply.body.message).toBe(
      'An unexpected error occurred. Quote the requestId when reporting it.',
    );
    expect(reply.body.error).toBe('Internal Server Error');
  });

  it('hides a NafaError that resolves to 5xx just as thoroughly', () => {
    // INTERNAL_ERROR is a NafaError too. Knowing the type must not become a
    // way to leak through the 5xx rule.
    const { reply, errored } = runFilter(
      new RuleViolation(ErrorCode.INTERNAL_ERROR, 'pool exhausted at pg:5432'),
    );

    expect(reply.status).toBe(500);
    expect(reply.body.message).not.toContain('pg:5432');
    expect(errored).toHaveLength(1);
  });

  it('still carries the request and correlation ids', () => {
    const { reply } = runFilter(new Error('boom'));

    expect(reply.body.requestId).toBe('req-1');
    expect(reply.body.correlationId).toBe('corr-1');
    expect(reply.body.path).toBe('/products/E2A');
  });
});
