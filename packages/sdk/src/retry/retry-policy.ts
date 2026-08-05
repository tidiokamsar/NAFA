export type HttpMethod =
  'GET' | 'HEAD' | 'OPTIONS' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Methods that are idempotent by HTTP semantics: repeating them has the same
 * effect as doing them once.
 *
 * PUT and DELETE are included because the spec defines them as idempotent.
 * POST and PATCH are not — retrying a POST can create a second record or
 * charge a payment twice, which is why they are never retried unless the
 * caller explicitly opts in with an idempotency key.
 */
const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set([
  'GET',
  'HEAD',
  'OPTIONS',
  'PUT',
  'DELETE',
]);

/**
 * Status codes worth retrying.
 *
 * 4xx are excluded on purpose — a 400 will still be a 400 in two seconds, and
 * retrying only wastes time and load. 429 is the exception: it explicitly
 * means "try again later".
 */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500,
  502,
  503,
  504,
]);

export interface RetryOptions {
  /** Retries after the first attempt. 0 disables retrying. */
  maxRetries: number;
  /** Delay before the first retry, in milliseconds. */
  baseDelayMs: number;
  /** Ceiling for a single delay, in milliseconds. */
  maxDelayMs: number;
  /**
   * Allows retrying non-idempotent methods. Only set this when the request
   * carries an idempotency key that the server honours.
   */
  retryNonIdempotent?: boolean;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 2,
  baseDelayMs: 200,
  maxDelayMs: 5_000,
};

export interface RetryDecision {
  retry: boolean;
  /** Milliseconds to wait before the next attempt. */
  delayMs: number;
  reason: string;
}

/**
 * Exponential backoff with **full jitter**.
 *
 * Plain exponential backoff makes every client that failed at the same moment
 * retry at the same moment, so the recovering server is hit by a synchronised
 * wave and falls over again. Randomising across the whole window spreads them
 * out. See AWS's "Exponential Backoff and Jitter".
 *
 * @param random injectable so tests are deterministic.
 */
export function backoffDelay(
  attempt: number,
  options: Pick<RetryOptions, 'baseDelayMs' | 'maxDelayMs'>,
  random: () => number = Math.random,
): number {
  const exponential = options.baseDelayMs * 2 ** attempt;
  const capped = Math.min(exponential, options.maxDelayMs);
  return Math.floor(random() * capped);
}

/**
 * Parses `Retry-After`, which the server may express as seconds or as an
 * HTTP date. A server that says how long to wait knows better than our
 * backoff formula, so its value wins.
 *
 * @returns milliseconds, or undefined when absent or unparseable.
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return seconds >= 0 ? seconds * 1000 : undefined;
  }

  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

export interface RetryContext {
  method: string;
  /** Absent when the request failed before a response arrived. */
  status?: number;
  retryAfterHeader?: string | null;
  /** 0 for the first retry decision. */
  attempt: number;
  /** True when the failure was a network error or a timeout. */
  isNetworkError?: boolean;
}

/**
 * Decides whether to retry, and how long to wait.
 *
 * A network error is retried on idempotent methods: the request may never have
 * reached the server. For POST it is not, because we cannot tell whether the
 * server processed it before the connection dropped.
 */
export function shouldRetry(
  context: RetryContext,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS,
  random: () => number = Math.random,
  now: number = Date.now(),
): RetryDecision {
  const no = (reason: string): RetryDecision => ({
    retry: false,
    delayMs: 0,
    reason,
  });

  if (options.maxRetries <= 0) return no('Retrying is disabled.');
  if (context.attempt >= options.maxRetries) {
    return no(`Exhausted ${options.maxRetries} retries.`);
  }

  const idempotent =
    IDEMPOTENT_METHODS.has(context.method.toUpperCase()) ||
    options.retryNonIdempotent === true;

  if (!idempotent) {
    return no(
      `${context.method} is not idempotent; retrying could duplicate the effect.`,
    );
  }

  if (context.isNetworkError) {
    return {
      retry: true,
      delayMs: backoffDelay(context.attempt, options, random),
      reason: 'Network error.',
    };
  }

  if (context.status === undefined) {
    return no('No status and no network error; nothing to act on.');
  }

  if (!RETRYABLE_STATUSES.has(context.status)) {
    return no(`Status ${context.status} is not retryable.`);
  }

  // The server's own guidance beats our formula, but stays capped so a
  // misconfigured or hostile `Retry-After: 86400` cannot hang the caller.
  const retryAfter = parseRetryAfter(context.retryAfterHeader, now);
  const delayMs =
    retryAfter !== undefined
      ? Math.min(retryAfter, options.maxDelayMs)
      : backoffDelay(context.attempt, options, random);

  return {
    retry: true,
    delayMs,
    reason:
      retryAfter !== undefined
        ? `Status ${context.status}, honouring Retry-After.`
        : `Status ${context.status} is retryable.`,
  };
}
