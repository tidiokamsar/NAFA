import type { AuthenticatedUser, NafaJwtClaims } from './auth.types';

/**
 * How a verified token becomes an {@link AuthenticatedUser}.
 *
 * This is the seam that keeps `@nafa/security` independent of IAM. The default
 * implementation ({@link ClaimsPrincipalResolver}) trusts what the token says.
 * A service that needs fresher data — roles revoked since the token was
 * issued, permissions stored in a database — binds its own implementation:
 *
 * ```ts
 * { provide: PrincipalResolver, useClass: DatabasePrincipalResolver }
 * ```
 */
export abstract class PrincipalResolver {
  abstract resolve(
    claims: NafaJwtClaims,
  ): Promise<AuthenticatedUser> | AuthenticatedUser;
}

/**
 * Default resolver: the token is the single source of truth.
 *
 * Fast (no I/O on the request path) but it cannot reflect a permission change
 * until the token expires. That trade-off is the reason access tokens should
 * stay short-lived.
 */
export class ClaimsPrincipalResolver extends PrincipalResolver {
  resolve(claims: NafaJwtClaims): AuthenticatedUser {
    return {
      id: claims.sub,
      tenantId: claims.tid,
      email: claims.email,
      roles: claims.roles ?? [],
      permissions: claims.perms ?? [],
      attributes: claims.attrs,
    };
  }
}
