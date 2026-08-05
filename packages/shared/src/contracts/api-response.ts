import type { PageMeta } from '../types/pagination.types';
import type { UnknownRecord } from '../types/primitives';
import type { ErrorCode } from '../errors/error-codes';

/** API version every response is stamped with. */
export const API_VERSION = 'v1';

/** Fields present on every response, success or failure. */
export interface ResponseEnvelope {
  success: boolean;
  /** Distributed-trace id — the one to quote in a bug report. */
  traceId?: string;
  /** ISO 8601, set by the server. */
  timestamp: string;
  version: string;
}

/** Anything a client may need beyond the payload itself. */
export interface ResponseMeta extends UnknownRecord {
  pagination?: PageMeta;
}

export interface SuccessResponse<T> extends ResponseEnvelope {
  success: true;
  data: T;
  meta?: ResponseMeta;
}

export interface ApiErrorBody {
  code: ErrorCode | string;
  /** Human-readable. Never branch on this — branch on `code`. */
  message: string;
  /** Per-field messages for validation failures. */
  fields?: Record<string, string[]>;
  details?: UnknownRecord;
}

export interface ErrorResponseBody extends ResponseEnvelope {
  success: false;
  error: ApiErrorBody;
  /** Route that produced the error. */
  path?: string;
  requestId?: string;
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponseBody;

export interface EnvelopeContext {
  traceId?: string;
  requestId?: string;
  path?: string;
  /** Injectable for tests; defaults to now. */
  timestamp?: string;
}

/**
 * Wraps a payload in the standard success envelope.
 *
 * Every NAFA API answers with this shape, so a client writes one response
 * handler instead of one per service. The envelope is added by an interceptor,
 * not by controllers — a controller returns its data and stays unaware.
 */
export function successResponse<T>(
  data: T,
  meta?: ResponseMeta,
  context: EnvelopeContext = {},
): SuccessResponse<T> {
  return {
    success: true,
    data,
    ...(meta ? { meta } : {}),
    ...(context.traceId ? { traceId: context.traceId } : {}),
    timestamp: context.timestamp ?? new Date().toISOString(),
    version: API_VERSION,
  };
}

/** Wraps an error in the standard failure envelope. */
export function errorResponse(
  error: ApiErrorBody,
  context: EnvelopeContext = {},
): ErrorResponseBody {
  return {
    success: false,
    error,
    ...(context.path ? { path: context.path } : {}),
    ...(context.requestId ? { requestId: context.requestId } : {}),
    ...(context.traceId ? { traceId: context.traceId } : {}),
    timestamp: context.timestamp ?? new Date().toISOString(),
    version: API_VERSION,
  };
}

/** Narrows a response to its success branch. */
export function isSuccessResponse<T>(
  response: ApiResponse<T>,
): response is SuccessResponse<T> {
  return response.success;
}
