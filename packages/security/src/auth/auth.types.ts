/**
 * Core authentication types.
 *
 * These describe *who* is calling, never *what* they are allowed to do in
 * business terms. No NAFA domain concept (producer, buyer, order) appears
 * here, and nothing in this package imports from a service.
 */

/** A role name, e.g. `admin` or `logistics.dispatcher`. */
export type Role = string;

/**
 * A permission in `resource:action` form, e.g. `shipment:read`.
 *
 * `*` is a wildcard segment: `shipment:*` grants every action on shipments,
 * and `*:*` grants everything. See {@link RbacService} for matching rules.
 */
export type Permission = string;

/**
 * The authenticated caller, rebuilt from the access token on every request.
 *
 * Deliberately minimal: it holds identifiers and authorisation data, never a
 * profile. Services that need more load it themselves.
 */
export interface AuthenticatedUser {
  /** Subject — stable, opaque user identifier (the JWT `sub` claim). */
  readonly id: string;
  /** Tenant/organisation the caller acts for, when the platform is multi-tenant. */
  readonly tenantId?: string;
  readonly email?: string;
  readonly roles: readonly Role[];
  readonly permissions: readonly Permission[];
  /**
   * Extra claims carried by the token. Used by ABAC policies to reason about
   * attributes the platform does not model explicitly (department, seniority,
   * clearance level, ...).
   */
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/** Claims NAFA puts in an access token, on top of the registered JWT ones. */
export interface NafaJwtClaims {
  sub: string;
  tid?: string;
  email?: string;
  roles?: Role[];
  perms?: Permission[];
  attrs?: Record<string, unknown>;
  /** Token type — lets verification refuse a refresh token on an API call. */
  typ?: TokenType;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  jti?: string;
}

export type TokenType = 'access' | 'refresh';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  tokenType: 'Bearer';
}
