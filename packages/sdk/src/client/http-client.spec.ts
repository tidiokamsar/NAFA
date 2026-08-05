import { ErrorCode } from '@nafa/shared';
import { SdkHttpError, SdkNetworkError, SdkTimeoutError } from './errors';
import { HttpClient } from './http-client';
import type { FetchLike } from './http-client.types';

/** Minimal Response stand-in — enough of the surface the client touches. */
function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const status = init.status ?? 200;
  const headers = new Map(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    json: async () => body,
  } as unknown as Response;
}

function envelope<T>(data: T) {
  return {
    success: true,
    data,
    timestamp: '2026-07-28T10:00:00.000Z',
    version: 'v1',
  };
}

/** Records calls and replays queued responses. */
function fakeFetch(responses: (Response | Error)[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  let index = 0;

  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (next instanceof Error) throw next;
    return next;
  };

  return { impl, calls, callCount: () => index };
}

const noSleep = async () => undefined;

/** Awaits a rejection and returns it typed, failing loudly if none comes. */
async function captureError(promise: Promise<unknown>): Promise<SdkHttpError> {
  try {
    await promise;
  } catch (error) {
    return error as SdkHttpError;
  }
  throw new Error('Expected the request to reject, but it resolved.');
}

function clientWith(
  responses: (Response | Error)[],
  overrides: Partial<ConstructorParameters<typeof HttpClient>[0]> = {},
) {
  const fetcher = fakeFetch(responses);
  const client = new HttpClient({
    baseUrl: 'https://api.nafa.test',
    fetch: fetcher.impl,
    sleep: noSleep,
    ...overrides,
  });
  return { client, fetcher };
}

describe('HttpClient', () => {
  describe('envelope handling', () => {
    it('returns data from a NAFA envelope', async () => {
      const { client } = clientWith([jsonResponse(envelope({ id: '1' }))]);
      await expect(client.get('/actors/1')).resolves.toEqual({ id: '1' });
    });

    // The SDK must stay usable against third-party APIs.
    it('returns the raw body when there is no envelope', async () => {
      const { client } = clientWith([jsonResponse({ id: '1', raw: true })]);
      await expect(client.get('/external')).resolves.toEqual({
        id: '1',
        raw: true,
      });
    });

    it('handles a 204 with no body', async () => {
      const { client } = clientWith([jsonResponse(undefined, { status: 204 })]);
      await expect(client.delete('/actors/1')).resolves.toBeUndefined();
    });
  });

  describe('url building', () => {
    it('joins base and path without doubling the slash', async () => {
      const { client, fetcher } = clientWith([jsonResponse(envelope(null))], {
        baseUrl: 'https://api.nafa.test/',
      });
      await client.get('/actors');
      expect(fetcher.calls[0].url).toBe('https://api.nafa.test/actors');
    });

    it('accepts a path without a leading slash', async () => {
      const { client, fetcher } = clientWith([jsonResponse(envelope(null))]);
      await client.get('actors');
      expect(fetcher.calls[0].url).toBe('https://api.nafa.test/actors');
    });

    it('serialises query parameters', async () => {
      const { client, fetcher } = clientWith([jsonResponse(envelope([]))]);
      await client.get('/actors', { query: { page: 2, active: true } });
      expect(fetcher.calls[0].url).toContain('page=2');
      expect(fetcher.calls[0].url).toContain('active=true');
    });

    // `?status=undefined` would be read as the literal string by the server.
    it('drops null and undefined query values', async () => {
      const { client, fetcher } = clientWith([jsonResponse(envelope([]))]);
      await client.get('/actors', {
        query: { page: 1, status: undefined, search: null },
      });
      expect(fetcher.calls[0].url).not.toContain('status');
      expect(fetcher.calls[0].url).not.toContain('search');
    });
  });

  describe('context propagation', () => {
    it('forwards correlation, trace, tenant and auth headers', async () => {
      const { client, fetcher } = clientWith([jsonResponse(envelope(null))], {
        getContext: () => ({
          correlationId: 'corr-1',
          traceId: 'trace-1',
          tenantId: 'tenant-1',
          accessToken: 'token-abc',
          locale: 'fr-GN',
        }),
      });

      await client.get('/actors');
      const headers = fetcher.calls[0].init?.headers as Record<string, string>;

      expect(headers['x-correlation-id']).toBe('corr-1');
      expect(headers['x-trace-id']).toBe('trace-1');
      expect(headers['x-tenant-id']).toBe('tenant-1');
      expect(headers['authorization']).toBe('Bearer token-abc');
      expect(headers['accept-language']).toBe('fr-GN');
    });

    // The context differs between concurrent requests on a server, so it must
    // be read per call rather than captured at construction.
    it('reads the context on every call', async () => {
      let current = 'first';
      const { client, fetcher } = clientWith(
        [jsonResponse(envelope(null)), jsonResponse(envelope(null))],
        { getContext: () => ({ correlationId: current }) },
      );

      await client.get('/a');
      current = 'second';
      await client.get('/b');

      const first = fetcher.calls[0].init?.headers as Record<string, string>;
      const second = fetcher.calls[1].init?.headers as Record<string, string>;
      expect(first['x-correlation-id']).toBe('first');
      expect(second['x-correlation-id']).toBe('second');
    });

    it('omits the auth header when there is no token', async () => {
      const { client, fetcher } = clientWith([jsonResponse(envelope(null))]);
      await client.get('/public');
      const headers = fetcher.calls[0].init?.headers as Record<string, string>;
      expect(headers['authorization']).toBeUndefined();
    });

    it('lets per-request headers override the defaults', async () => {
      const { client, fetcher } = clientWith([jsonResponse(envelope(null))], {
        defaultHeaders: { 'x-source': 'default' },
      });
      await client.get('/a', { headers: { 'x-source': 'override' } });
      const headers = fetcher.calls[0].init?.headers as Record<string, string>;
      expect(headers['x-source']).toBe('override');
    });

    it('sends the idempotency key when supplied', async () => {
      const { client, fetcher } = clientWith([jsonResponse(envelope(null))]);
      await client.post('/orders', { total: 1 }, { idempotencyKey: 'key-1' });
      const headers = fetcher.calls[0].init?.headers as Record<string, string>;
      expect(headers['idempotency-key']).toBe('key-1');
    });
  });

  describe('errors', () => {
    it('maps a NAFA error envelope to its code and message', async () => {
      const { client } = clientWith([
        jsonResponse(
          {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Actor 1 not found' },
            timestamp: '2026-07-28T10:00:00.000Z',
            version: 'v1',
          },
          { status: 404 },
        ),
      ]);

      await expect(client.get('/actors/1')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: 'Actor 1 not found',
        status: 404,
      });
    });

    it('falls back to the status when the body is not an envelope', async () => {
      const { client } = clientWith([
        jsonResponse({ nope: true }, { status: 403 }),
      ]);
      const error = await captureError(client.get('/actors'));
      expect(error).toBeInstanceOf(SdkHttpError);
      expect(error.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('surfaces a network failure as SdkNetworkError', async () => {
      const { client } = clientWith([new TypeError('fetch failed')], {
        retry: { maxRetries: 0 },
      });
      await expect(client.get('/actors')).rejects.toBeInstanceOf(
        SdkNetworkError,
      );
    });

    it('keeps the correlation id from the response for log searches', async () => {
      const { client } = clientWith([
        jsonResponse(
          { oops: true },
          {
            status: 500,
            headers: { 'x-correlation-id': 'corr-9' },
          },
        ),
      ]);
      const error = await captureError(
        client.get('/actors', { retry: { maxRetries: 0 } }),
      );
      expect(error.correlationId).toBe('corr-9');
    });
  });

  describe('retry behaviour', () => {
    it('retries a 503 and returns the eventual success', async () => {
      const { client, fetcher } = clientWith([
        jsonResponse({}, { status: 503 }),
        jsonResponse(envelope({ id: 'ok' })),
      ]);
      await expect(client.get('/actors')).resolves.toEqual({ id: 'ok' });
      expect(fetcher.callCount()).toBe(2);
    });

    it('does not retry a 404', async () => {
      const { client, fetcher } = clientWith([
        jsonResponse({}, { status: 404 }),
      ]);
      await expect(client.get('/actors/1')).rejects.toBeDefined();
      expect(fetcher.callCount()).toBe(1);
    });

    // The safety property that matters most: no duplicate writes.
    it('does not retry a POST', async () => {
      const { client, fetcher } = clientWith([
        jsonResponse({}, { status: 503 }),
        jsonResponse(envelope({})),
      ]);
      await expect(client.post('/orders', {})).rejects.toBeDefined();
      expect(fetcher.callCount()).toBe(1);
    });

    it('retries a POST that carries an idempotency key', async () => {
      const { client, fetcher } = clientWith([
        jsonResponse({}, { status: 503 }),
        jsonResponse(envelope({ id: 'created' })),
      ]);
      await expect(
        client.post('/orders', {}, { idempotencyKey: 'key-1' }),
      ).resolves.toEqual({ id: 'created' });
      expect(fetcher.callCount()).toBe(2);
    });

    it('gives up after the configured number of retries', async () => {
      const { client, fetcher } = clientWith(
        [jsonResponse({}, { status: 500 })],
        { retry: { maxRetries: 2 } },
      );
      await expect(client.get('/actors')).rejects.toBeDefined();
      expect(fetcher.callCount()).toBe(3); // 1 attempt + 2 retries
    });
  });

  describe('timeout', () => {
    it('raises SdkTimeoutError when the request outlives the budget', async () => {
      const hang: FetchLike = (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        });

      const client = new HttpClient({
        baseUrl: 'https://api.nafa.test',
        fetch: hang,
        sleep: noSleep,
        timeoutMs: 10,
        retry: { maxRetries: 0 },
      });

      await expect(client.get('/slow')).rejects.toBeInstanceOf(SdkTimeoutError);
    });
  });

  it('refuses to construct without a fetch implementation', () => {
    const original = globalThis.fetch;
    // @ts-expect-error deliberately removing it for the test
    delete globalThis.fetch;
    try {
      expect(() => new HttpClient({ baseUrl: 'https://x.test' })).toThrow(
        /fetch/i,
      );
    } finally {
      globalThis.fetch = original;
    }
  });
});
