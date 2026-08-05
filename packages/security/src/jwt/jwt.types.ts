/** Algorithms NAFA allows. Asymmetric ones are required in production. */
export type JwtAlgorithm = 'HS256' | 'RS256' | 'ES256';

/**
 * One signing key.
 *
 * `kid` goes into the token header so a verifier can pick the right key
 * without trial and error — the mechanism that makes rotation possible.
 */
export interface JwtSigningKey {
  /** Key id, unique and stable for the life of the key. */
  kid: string;
  algorithm: JwtAlgorithm;
  /** Raw secret (HS256) or PEM-encoded private key (RS256/ES256). */
  privateKey: string;
  /** PEM-encoded public key. Omit for HS256, where the secret verifies too. */
  publicKey?: string;
  /**
   * When false the key still verifies existing tokens but signs no new ones —
   * the state a key sits in between rotation and the expiry of the last token
   * it signed.
   */
  active: boolean;
}

export interface JwtOptions {
  issuer: string;
  audience: string;
  /** Access token lifetime in seconds. Keep short: claims cannot be revoked. */
  accessTokenTtl: number;
  /** Refresh token lifetime in seconds. */
  refreshTokenTtl: number;
  /** Allowed clock drift between issuer and verifier, in seconds. */
  clockToleranceSeconds?: number;
}

export const JWT_OPTIONS = Symbol('JWT_OPTIONS');
export const JWT_KEYS = Symbol('JWT_KEYS');
