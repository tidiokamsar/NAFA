import {
  ErrorCode,
  NafaError,
  type ApiErrorBody,
  type ErrorResponseBody,
} from '@nafa/shared';

/**
 * Raised when a call fails. Extends {@link NafaError} so a caller can handle
 * remote and local failures with one `catch`, branching on `code`.
 */
export class SdkHttpError extends NafaError {
  readonly url: string;
  readonly method: string;
  /** Correlation id from the response, for cross-service log searches. */
  readonly correlationId?: string;

  constructor(params: {
    code: ErrorCode;
    message: string;
    status: number;
    url: string;
    method: string;
    correlationId?: string;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(params.code, params.message, {
      status: params.status,
      details: params.details,
      cause: params.cause,
    });
    this.url = params.url;
    this.method = params.method;
    this.correlationId = params.correlationId;
  }
}

/** The request never got an answer: DNS failure, connection reset, timeout. */
export class SdkNetworkError extends NafaError {
  constructor(
    readonly url: string,
    readonly method: string,
    cause?: unknown,
  ) {
    super(
      ErrorCode.DEPENDENCY_UNAVAILABLE,
      `${method} ${url} did not complete`,
      { cause },
    );
  }
}

export class SdkTimeoutError extends NafaError {
  constructor(
    readonly url: string,
    readonly method: string,
    readonly timeoutMs: number,
  ) {
    super(
      ErrorCode.TIMEOUT,
      `${method} ${url} timed out after ${timeoutMs}ms`,
      {
        details: { timeoutMs },
      },
    );
  }
}

/**
 * Maps an HTTP status to an error code, used when the body is not a NAFA
 * envelope — a proxy 502, an HTML error page, a non-NAFA service.
 */
export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.MALFORMED_REQUEST;
    case 401:
      return ErrorCode.UNAUTHENTICATED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 422:
      return ErrorCode.BUSINESS_RULE_VIOLATION;
    case 429:
      return ErrorCode.RATE_LIMIT_EXCEEDED;
    case 504:
      return ErrorCode.TIMEOUT;
    default:
      return status >= 500
        ? ErrorCode.DEPENDENCY_UNAVAILABLE
        : ErrorCode.INTERNAL_ERROR;
  }
}

/** True when the payload is a NAFA error envelope. */
export function isErrorEnvelope(body: unknown): body is ErrorResponseBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { success?: unknown }).success === false &&
    typeof (body as { error?: unknown }).error === 'object'
  );
}

/**
 * Builds the error to throw for a failed response.
 *
 * When the peer is a NAFA service its envelope carries the real code and
 * message, which are far more useful than the status alone; otherwise the
 * status is all there is to go on.
 */
export function errorFromResponse(params: {
  status: number;
  url: string;
  method: string;
  body: unknown;
  correlationId?: string;
}): SdkHttpError {
  const { status, url, method, body, correlationId } = params;

  if (isErrorEnvelope(body)) {
    const remote: ApiErrorBody = body.error;
    return new SdkHttpError({
      code: (remote.code as ErrorCode) ?? codeForStatus(status),
      message: remote.message,
      status,
      url,
      method,
      correlationId: correlationId ?? body.traceId,
      details: { ...remote.details, fields: remote.fields },
    });
  }

  return new SdkHttpError({
    code: codeForStatus(status),
    message: `${method} ${url} failed with status ${status}`,
    status,
    url,
    method,
    correlationId,
  });
}
