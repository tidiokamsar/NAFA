import type { RetryOptions } from '../retry/retry-policy';
import type { HttpMethod } from '../retry/retry-policy';

/** Subset of `fetch` the SDK relies on. Injectable so tests need no network. */
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Ambient values forwarded on every outgoing call so a transaction stays
 * traceable across service hops. Resolved per request, because in a server the
 * values differ between concurrent requests.
 */
export interface OutboundContext {
  correlationId?: string;
  traceId?: string;
  requestId?: string;
  tenantId?: string;
  locale?: string;
  channel?: string;
  /** Bearer token, without the `Bearer ` prefix. */
  accessToken?: string;
}

export interface HttpClientOptions {
  /** Base URL, e.g. `https://iam.nafa.gov.gn`. Trailing slash optional. */
  baseUrl: string;
  /** Per-attempt timeout in milliseconds. Default 10 000. */
  timeoutMs?: number;
  retry?: Partial<RetryOptions>;
  /** Headers sent on every request. */
  defaultHeaders?: Record<string, string>;
  /**
   * Supplies the ambient context per call. A function rather than a value:
   * on a server the correlation id changes with every inbound request.
   */
  getContext?: () => OutboundContext | undefined;
  /** Override for tests, or to plug in a instrumented fetch. */
  fetch?: FetchLike;
  /** Sleep function; injectable so tests do not wait in real time. */
  sleep?: (ms: number) => Promise<void>;
}

export interface RequestOptions {
  method?: HttpMethod;
  /** Query parameters. `undefined` values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Serialised as JSON unless it is already a string. */
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retry?: Partial<RetryOptions>;
  /**
   * Makes a non-idempotent request safely retryable. The server must honour
   * the key; without server support this only masks duplicates client-side.
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
}
