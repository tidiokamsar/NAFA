/**
 * Stable, machine-readable error codes.
 *
 * A client branches on the code, never on the message: messages get reworded
 * and translated, codes do not. Adding a code is safe; changing the meaning of
 * an existing one is a breaking change.
 */
export const ErrorCode = {
  // --- validation & input ---
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  MALFORMED_REQUEST: 'MALFORMED_REQUEST',

  // --- authentication & authorisation ---
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',

  // --- resources ---
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',
  /** Optimistic concurrency: the row changed under the caller. */
  STALE_VERSION: 'STALE_VERSION',

  // --- domain ---
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',

  // --- infrastructure ---
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Default HTTP status for each code. Transport mapping lives in one place. */
export const ERROR_CODE_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  INVALID_ARGUMENT: 400,
  MALFORMED_REQUEST: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  TOKEN_EXPIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  CONFLICT: 409,
  STALE_VERSION: 409,
  BUSINESS_RULE_VIOLATION: 422,
  INVALID_STATE_TRANSITION: 422,
  RATE_LIMIT_EXCEEDED: 429,
  DEPENDENCY_UNAVAILABLE: 503,
  TIMEOUT: 504,
  INTERNAL_ERROR: 500,
  NOT_IMPLEMENTED: 501,
};
