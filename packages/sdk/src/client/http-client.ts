import {
  API_VERSION_HEADER,
  AUTHORIZATION_HEADER,
  ACCEPT_LANGUAGE_HEADER,
  CHANNEL_HEADER,
  CORRELATION_ID_HEADER,
  IDEMPOTENCY_KEY_HEADER,
  REQUEST_ID_HEADER,
  TENANT_ID_HEADER,
  TRACE_ID_HEADER,
  isSuccessResponse,
  type ApiResponse,
} from '@nafa/shared';
import {
  DEFAULT_RETRY_OPTIONS,
  shouldRetry,
  type HttpMethod,
  type RetryOptions,
} from '../retry/retry-policy';
import { SdkNetworkError, SdkTimeoutError, errorFromResponse } from './errors';
import type {
  FetchLike,
  HttpClientOptions,
  OutboundContext,
  RequestOptions,
} from './http-client.types';

const DEFAULT_TIMEOUT_MS = 10_000;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * HTTP client for calling NAFA APIs.
 *
 * Built on `fetch` rather than axios: it is native in Node 22 and in browsers,
 * so the SDK ships with no transport dependency and runs unchanged in a
 * service, a Next.js server component and a browser.
 *
 * Three things it does that hand-written calls usually forget:
 *
 *  - **propagates the request context**, so one business transaction keeps one
 *    correlation id across every hop;
 *  - **retries only what is safe to retry** (see {@link shouldRetry});
 *  - **unwraps the response envelope**, so callers get their data and errors
 *    arrive as {@link NafaError}s rather than as a status code to interpret.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retry: RetryOptions;
  private readonly defaultHeaders: Record<string, string>;
  private readonly getContext: () => OutboundContext | undefined;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retry = { ...DEFAULT_RETRY_OPTIONS, ...options.retry };
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.getContext = options.getContext ?? (() => undefined);
    this.sleep = options.sleep ?? defaultSleep;

    const resolved = options.fetch ?? globalThis.fetch;
    if (!resolved) {
      throw new Error(
        'No fetch implementation available. Pass one via options.fetch.',
      );
    }
    // Bound because a bare `globalThis.fetch` loses its receiver.
    this.fetchImpl = resolved.bind(globalThis) as FetchLike;
  }

  get<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options: RequestOptions = {}) {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  put<T>(path: string, body?: unknown, options: RequestOptions = {}) {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  patch<T>(path: string, body?: unknown, options: RequestOptions = {}) {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  delete<T>(path: string, options: RequestOptions = {}) {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  /** Issues a request, retrying per policy, and returns the unwrapped data. */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET';
    const url = this.buildUrl(path, options.query);
    const retry: RetryOptions = {
      ...this.retry,
      ...options.retry,
      // An idempotency key is exactly what makes a POST safe to repeat.
      retryNonIdempotent:
        options.retry?.retryNonIdempotent ?? Boolean(options.idempotencyKey),
    };

    let attempt = 0;

    for (;;) {
      const outcome = await this.attempt(url, method, options);

      const decision = shouldRetry(
        {
          method,
          status: outcome.kind === 'response' ? outcome.status : undefined,
          retryAfterHeader:
            outcome.kind === 'response' ? outcome.retryAfter : undefined,
          attempt,
          isNetworkError: outcome.kind !== 'response',
        },
        retry,
      );

      if (decision.retry) {
        await this.sleep(decision.delayMs);
        attempt += 1;
        continue;
      }

      if (outcome.kind === 'timeout') {
        throw new SdkTimeoutError(url, method, outcome.timeoutMs);
      }
      if (outcome.kind === 'network') {
        throw new SdkNetworkError(url, method, outcome.cause);
      }
      if (!outcome.ok) {
        throw errorFromResponse({
          status: outcome.status,
          url,
          method,
          body: outcome.body,
          correlationId: outcome.correlationId,
        });
      }

      return this.unwrap<T>(outcome.body);
    }
  }

  /** One attempt. Never throws: the caller decides what to do with failure. */
  private async attempt(
    url: string,
    method: HttpMethod,
    options: RequestOptions,
  ): Promise<
    | {
        kind: 'response';
        ok: boolean;
        status: number;
        body: unknown;
        retryAfter: string | null;
        correlationId?: string;
      }
    | { kind: 'timeout'; timeoutMs: number }
    | { kind: 'network'; cause: unknown }
  > {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // A caller-supplied signal must still be able to cancel the request.
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort);

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: this.buildHeaders(options),
        body: this.serialiseBody(options.body),
        signal: controller.signal,
      });

      const body = await this.parseBody(response);

      return {
        kind: 'response',
        ok: response.ok,
        status: response.status,
        body,
        retryAfter: response.headers?.get?.('retry-after') ?? null,
        correlationId:
          response.headers?.get?.(CORRELATION_ID_HEADER) ?? undefined,
      };
    } catch (error) {
      // An abort is either our timeout or the caller's cancellation; both
      // surface here identically, so distinguish by who asked.
      if (options.signal?.aborted) {
        return { kind: 'network', cause: error };
      }
      if (controller.signal.aborted) {
        return { kind: 'timeout', timeoutMs };
      }
      return { kind: 'network', cause: error };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const normalised = path.startsWith('/') ? path : `/${path}`;
    const url = `${this.baseUrl}${normalised}`;

    if (!query) return url;

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      // Dropping null/undefined avoids sending `?status=undefined`, which a
      // server would read as the literal string.
      if (value === undefined || value === null) continue;
      params.append(key, String(value));
    }

    const serialised = params.toString();
    return serialised ? `${url}?${serialised}` : url;
  }

  private buildHeaders(options: RequestOptions): Record<string, string> {
    const context = this.getContext() ?? {};
    const headers: Record<string, string> = {
      accept: 'application/json',
      [API_VERSION_HEADER]: 'v1',
      ...this.defaultHeaders,
    };

    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    if (context.accessToken) {
      headers[AUTHORIZATION_HEADER] = `Bearer ${context.accessToken}`;
    }
    if (context.correlationId) {
      headers[CORRELATION_ID_HEADER] = context.correlationId;
    }
    if (context.traceId) headers[TRACE_ID_HEADER] = context.traceId;
    if (context.requestId) headers[REQUEST_ID_HEADER] = context.requestId;
    if (context.tenantId) headers[TENANT_ID_HEADER] = context.tenantId;
    if (context.locale) headers[ACCEPT_LANGUAGE_HEADER] = context.locale;
    if (context.channel) headers[CHANNEL_HEADER] = context.channel;
    if (options.idempotencyKey) {
      headers[IDEMPOTENCY_KEY_HEADER] = options.idempotencyKey;
    }

    // Per-request headers win, so a caller can always override.
    return { ...headers, ...options.headers };
  }

  private serialiseBody(body: unknown): string | undefined {
    if (body === undefined) return undefined;
    return typeof body === 'string' ? body : JSON.stringify(body);
  }

  private async parseBody(response: Response): Promise<unknown> {
    if (response.status === 204) return undefined;
    try {
      return await response.json();
    } catch {
      // A non-JSON body (proxy error page, empty response) is not fatal here;
      // the status still drives the outcome.
      return undefined;
    }
  }

  /**
   * Returns `data` from a NAFA envelope, or the raw body when the peer does
   * not use one — the SDK must stay usable against third-party APIs.
   */
  private unwrap<T>(body: unknown): T {
    if (
      typeof body === 'object' &&
      body !== null &&
      'success' in body &&
      'data' in body
    ) {
      const envelope = body as ApiResponse<T>;
      if (isSuccessResponse(envelope)) return envelope.data;
    }
    return body as T;
  }
}
