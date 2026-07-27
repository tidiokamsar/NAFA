/**
 * `x-request-id` identifies a single HTTP request.
 * `x-correlation-id` identifies a business transaction that may span several
 * requests and services — it is propagated unchanged across service hops.
 */
export const REQUEST_ID_HEADER = 'x-request-id';
export const CORRELATION_ID_HEADER = 'x-correlation-id';
