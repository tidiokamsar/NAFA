import {
  DEFAULT_RETRY_OPTIONS,
  backoffDelay,
  parseRetryAfter,
  shouldRetry,
  type RetryOptions,
} from './retry-policy';

const OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 5_000,
};

// Deterministic "random" so delays are assertable.
const alwaysMax = () => 0.999999;
const alwaysZero = () => 0;

describe('shouldRetry', () => {
  describe('idempotency', () => {
    it.each(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'])(
      'retries %s on a 503',
      (method) => {
        expect(
          shouldRetry({ method, status: 503, attempt: 0 }, OPTIONS).retry,
        ).toBe(true);
      },
    );

    // Retrying a POST can create a second record or charge twice.
    it.each(['POST', 'PATCH'])('never retries %s by default', (method) => {
      const decision = shouldRetry(
        { method, status: 503, attempt: 0 },
        OPTIONS,
      );
      expect(decision.retry).toBe(false);
      expect(decision.reason).toMatch(/not idempotent/i);
    });

    it('retries a POST when the caller opts in', () => {
      expect(
        shouldRetry(
          { method: 'POST', status: 503, attempt: 0 },
          {
            ...OPTIONS,
            retryNonIdempotent: true,
          },
        ).retry,
      ).toBe(true);
    });

    it('is case-insensitive about the method', () => {
      expect(
        shouldRetry({ method: 'get', status: 503, attempt: 0 }, OPTIONS).retry,
      ).toBe(true);
    });
  });

  describe('status codes', () => {
    it.each([408, 429, 500, 502, 503, 504])('retries %i', (status) => {
      expect(
        shouldRetry({ method: 'GET', status, attempt: 0 }, OPTIONS).retry,
      ).toBe(true);
    });

    // A 400 will still be a 400 in two seconds.
    it.each([400, 401, 403, 404, 409, 422])('does not retry %i', (status) => {
      expect(
        shouldRetry({ method: 'GET', status, attempt: 0 }, OPTIONS).retry,
      ).toBe(false);
    });

    it('does not retry a success', () => {
      expect(
        shouldRetry({ method: 'GET', status: 200, attempt: 0 }, OPTIONS).retry,
      ).toBe(false);
    });
  });

  describe('limits', () => {
    it('stops once the retry budget is spent', () => {
      const decision = shouldRetry(
        { method: 'GET', status: 503, attempt: 3 },
        OPTIONS,
      );
      expect(decision.retry).toBe(false);
      expect(decision.reason).toMatch(/exhausted/i);
    });

    it('never retries when maxRetries is zero', () => {
      expect(
        shouldRetry(
          { method: 'GET', status: 503, attempt: 0 },
          {
            ...OPTIONS,
            maxRetries: 0,
          },
        ).retry,
      ).toBe(false);
    });
  });

  describe('network errors', () => {
    it('retries an idempotent request that never got a response', () => {
      expect(
        shouldRetry(
          { method: 'GET', attempt: 0, isNetworkError: true },
          OPTIONS,
        ).retry,
      ).toBe(true);
    });

    // The server may have processed it before the connection dropped.
    it('does not retry a POST that never got a response', () => {
      expect(
        shouldRetry(
          { method: 'POST', attempt: 0, isNetworkError: true },
          OPTIONS,
        ).retry,
      ).toBe(false);
    });

    it('does nothing with neither a status nor a network error', () => {
      expect(shouldRetry({ method: 'GET', attempt: 0 }, OPTIONS).retry).toBe(
        false,
      );
    });
  });

  describe('Retry-After', () => {
    it('honours a delay in seconds', () => {
      const decision = shouldRetry(
        { method: 'GET', status: 429, retryAfterHeader: '2', attempt: 0 },
        OPTIONS,
      );
      expect(decision.delayMs).toBe(2000);
      expect(decision.reason).toMatch(/Retry-After/);
    });

    // A hostile or misconfigured `Retry-After: 86400` must not hang the caller.
    it('caps a huge Retry-After at maxDelayMs', () => {
      expect(
        shouldRetry(
          { method: 'GET', status: 503, retryAfterHeader: '86400', attempt: 0 },
          OPTIONS,
        ).delayMs,
      ).toBe(OPTIONS.maxDelayMs);
    });

    it('falls back to backoff when the header is unparseable', () => {
      const decision = shouldRetry(
        { method: 'GET', status: 503, retryAfterHeader: 'soon', attempt: 0 },
        OPTIONS,
        alwaysZero,
      );
      expect(decision.delayMs).toBe(0);
      expect(decision.reason).not.toMatch(/Retry-After/);
    });
  });
});

describe('parseRetryAfter', () => {
  it('reads seconds', () => {
    expect(parseRetryAfter('5')).toBe(5000);
  });

  it('reads an HTTP date', () => {
    const now = Date.parse('2026-07-28T10:00:00Z');
    expect(parseRetryAfter('Tue, 28 Jul 2026 10:00:30 GMT', now)).toBe(30_000);
  });

  it('clamps a date already in the past to zero', () => {
    const now = Date.parse('2026-07-28T10:01:00Z');
    expect(parseRetryAfter('Tue, 28 Jul 2026 10:00:00 GMT', now)).toBe(0);
  });

  it('ignores absent, empty or nonsense values', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter('')).toBeUndefined();
    expect(parseRetryAfter('later')).toBeUndefined();
  });

  it('ignores a negative number of seconds', () => {
    expect(parseRetryAfter('-5')).toBeUndefined();
  });
});

describe('backoffDelay', () => {
  it('grows exponentially at the top of the jitter window', () => {
    const opts = { baseDelayMs: 100, maxDelayMs: 10_000 };
    expect(backoffDelay(0, opts, alwaysMax)).toBe(99);
    expect(backoffDelay(1, opts, alwaysMax)).toBe(199);
    expect(backoffDelay(2, opts, alwaysMax)).toBe(399);
  });

  it('caps at maxDelayMs', () => {
    expect(
      backoffDelay(20, { baseDelayMs: 100, maxDelayMs: 5_000 }, alwaysMax),
    ).toBe(4999);
  });

  // Full jitter: without it, every client that failed together retries
  // together and knocks the recovering server over again.
  it('spreads delays across the whole window', () => {
    const opts = { baseDelayMs: 1000, maxDelayMs: 10_000 };
    expect(backoffDelay(3, opts, alwaysZero)).toBe(0);
    expect(backoffDelay(3, opts, () => 0.5)).toBe(4000);
    expect(backoffDelay(3, opts, alwaysMax)).toBe(7999);
  });

  it('ships sane defaults', () => {
    expect(DEFAULT_RETRY_OPTIONS.maxRetries).toBeGreaterThan(0);
    expect(DEFAULT_RETRY_OPTIONS.baseDelayMs).toBeGreaterThan(0);
  });
});
