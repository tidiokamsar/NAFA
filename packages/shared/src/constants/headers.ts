/**
 * HTTP headers NAFA services agree on.
 *
 * They live here rather than in `@nafa/platform` because both `platform` and
 * `security` need them, and a package that only holds constants can be
 * depended on by everything without creating a cycle.
 *
 * Always lowercase: Node normalises incoming header names to lowercase, so
 * comparing against a capitalised literal silently never matches.
 */

/** Identifies one HTTP request. Generated if the caller sent none. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Identifies a business transaction that may span several requests and
 * services. Propagated unchanged across hops.
 */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** Distributed-trace id, aligned with the OpenTelemetry trace. */
export const TRACE_ID_HEADER = 'x-trace-id';

/** Tenant the caller acts for, when it cannot be derived from the token. */
export const TENANT_ID_HEADER = 'x-tenant-id';

/** IANA timezone name, e.g. `Africa/Conakry`. */
export const TIMEZONE_HEADER = 'x-timezone';

/** Client surface: `web`, `mobile`, `ussd`, `whatsapp`, `api`. */
export const CHANNEL_HEADER = 'x-channel';

/** Opaque device identifier supplied by mobile clients. */
export const DEVICE_ID_HEADER = 'x-device-id';

/** Requested API version when it is not encoded in the path. */
export const API_VERSION_HEADER = 'x-api-version';

/** Idempotency key for safely retryable writes. */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** Standard headers, not NAFA-specific, but referenced often enough. */
export const AUTHORIZATION_HEADER = 'authorization';
export const ACCEPT_LANGUAGE_HEADER = 'accept-language';
export const USER_AGENT_HEADER = 'user-agent';

/** Every header a service should accept and expose through CORS. */
export const NAFA_HEADERS = [
  REQUEST_ID_HEADER,
  CORRELATION_ID_HEADER,
  TRACE_ID_HEADER,
  TENANT_ID_HEADER,
  TIMEZONE_HEADER,
  CHANNEL_HEADER,
  DEVICE_ID_HEADER,
  API_VERSION_HEADER,
] as const;
