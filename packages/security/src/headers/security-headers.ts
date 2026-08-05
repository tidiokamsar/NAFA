import helmet from 'helmet';
import type { HelmetOptions } from 'helmet';

export interface SecurityHeadersOptions {
  /**
   * Relaxes the CSP and cross-origin policies enough for Swagger UI to load.
   * Only enable where the docs are actually exposed.
   */
  allowSwaggerUi?: boolean;
  /** HSTS max-age in seconds. Default: one year. */
  hstsMaxAge?: number;
}

/**
 * Helmet configuration shared by every NAFA HTTP service.
 *
 * Defaults are the strict ones — an API serves JSON, so it has no reason to
 * allow inline scripts or framing. Services that host a UI opt out explicitly
 * rather than the library guessing.
 *
 * ```ts
 * app.use(securityHeaders({ allowSwaggerUi: true }));
 * ```
 */
export function securityHeaders(options: SecurityHeadersOptions = {}) {
  const { allowSwaggerUi = false, hstsMaxAge = 31_536_000 } = options;

  const config: HelmetOptions = {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        // Swagger UI injects its own styles and bootstrap script.
        scriptSrc: allowSwaggerUi ? ["'self'", "'unsafe-inline'"] : ["'self'"],
        styleSrc: allowSwaggerUi ? ["'self'", "'unsafe-inline'"] : ["'self'"],
        imgSrc: allowSwaggerUi ? ["'self'", 'data:'] : ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: {
      maxAge: hstsMaxAge,
      includeSubDomains: true,
      preload: true,
    },
    // Blocks the browser from guessing a response is a script when the API
    // said it was JSON.
    noSniff: true,
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    // Advertising the framework invites targeted probes.
    hidePoweredBy: true,
  };

  return helmet(config);
}
