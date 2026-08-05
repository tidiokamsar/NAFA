import { ErrorCode, ERROR_CODE_STATUS } from './error-codes';
import type { UnknownRecord } from '../types/primitives';

export interface NafaErrorOptions {
  /** Structured context. Redacted before it reaches a log or a response. */
  details?: UnknownRecord;
  /** The underlying failure, preserved for the stack trace. */
  cause?: unknown;
  /** Overrides the default status for the code. */
  status?: number;
}

/**
 * Base class for every deliberate NAFA error.
 *
 * Framework-free on purpose: domain code throws these without importing
 * NestJS, and the HTTP layer maps them to responses. That is what lets the
 * same domain logic run behind an HTTP API, a queue consumer or a CLI.
 */
export class NafaError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: UnknownRecord;

  constructor(
    code: ErrorCode,
    message: string,
    options: NafaErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.status = options.status ?? ERROR_CODE_STATUS[code];
    this.details = options.details;
    // Without this, `instanceof` fails for subclasses when targeting ES5-era
    // output, because Error breaks the prototype chain.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** True for any error deliberately raised by NAFA code. */
  static isNafaError(error: unknown): error is NafaError {
    return error instanceof NafaError;
  }
}

export class ValidationError extends NafaError {
  constructor(message = 'Validation failed', options?: NafaErrorOptions) {
    super(ErrorCode.VALIDATION_FAILED, message, options);
  }
}

export class NotFoundError extends NafaError {
  constructor(entity: string, id?: string, options?: NafaErrorOptions) {
    super(
      ErrorCode.NOT_FOUND,
      id ? `${entity} ${id} not found` : `${entity} not found`,
      { ...options, details: { entity, id, ...options?.details } },
    );
  }
}

export class AlreadyExistsError extends NafaError {
  constructor(entity: string, options?: NafaErrorOptions) {
    super(ErrorCode.ALREADY_EXISTS, `${entity} already exists`, {
      ...options,
      details: { entity, ...options?.details },
    });
  }
}

export class UnauthenticatedError extends NafaError {
  constructor(message = 'Authentication required', options?: NafaErrorOptions) {
    super(ErrorCode.UNAUTHENTICATED, message, options);
  }
}

export class ForbiddenError extends NafaError {
  constructor(
    message = 'Insufficient permissions',
    options?: NafaErrorOptions,
  ) {
    super(ErrorCode.FORBIDDEN, message, options);
  }
}

/**
 * A domain invariant was violated — the request was well-formed and the caller
 * was allowed, but the operation is not valid for the current state.
 */
export class BusinessRuleError extends NafaError {
  constructor(message: string, options?: NafaErrorOptions) {
    super(ErrorCode.BUSINESS_RULE_VIOLATION, message, options);
  }
}

export class InvalidStateTransitionError extends NafaError {
  constructor(from: string, to: string, options?: NafaErrorOptions) {
    super(
      ErrorCode.INVALID_STATE_TRANSITION,
      `Cannot transition from ${from} to ${to}`,
      { ...options, details: { from, to, ...options?.details } },
    );
  }
}

/** Optimistic concurrency failure, tied to the `version` audit column. */
export class StaleVersionError extends NafaError {
  constructor(entity: string, expected: number, actual: number) {
    super(ErrorCode.STALE_VERSION, `${entity} was modified by someone else`, {
      details: { entity, expected, actual },
    });
  }
}

export class DependencyUnavailableError extends NafaError {
  constructor(dependency: string, options?: NafaErrorOptions) {
    super(ErrorCode.DEPENDENCY_UNAVAILABLE, `${dependency} is unavailable`, {
      ...options,
      details: { dependency, ...options?.details },
    });
  }
}
