import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER } from '@nafa/platform';

export interface CorsOptions {
  origin: boolean | string | RegExp | (string | RegExp)[];
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  maxAge: number;
}

/**
 * CORS configuration for NAFA services.
 *
 * `origin` has no default on purpose: the only safe value depends on the
 * deployment, and a permissive fallback would silently ship to production.
 * Never combine `origin: '*'` with `credentials: true` — browsers reject it,
 * and wanting both usually means the auth model needs rethinking.
 *
 * The request and correlation id headers are both accepted (so a caller can
 * propagate a transaction id) and exposed (so a browser client can read the
 * one the server assigned).
 */
export function corsOptions(
  allowedOrigins: (string | RegExp)[],
  overrides: Partial<CorsOptions> = {},
): CorsOptions {
  return {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept-Language',
      REQUEST_ID_HEADER,
      CORRELATION_ID_HEADER,
      'X-Timezone',
    ],
    exposedHeaders: [REQUEST_ID_HEADER, CORRELATION_ID_HEADER],
    maxAge: 86_400,
    ...overrides,
  };
}
