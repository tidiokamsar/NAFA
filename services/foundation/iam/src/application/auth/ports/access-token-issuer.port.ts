import type { IdentityUser } from '../../../domain';
import type { AuthTokens } from '../auth-tokens';

/**
 * How the application layer obtains an access token for a user.
 *
 * Register and login both hand one out; funnelling them through a single port
 * is what keeps the two from drifting into different payloads. Whether that
 * token is a JWT, and what it is signed with, is not the application layer's
 * business.
 */
export interface AccessTokenIssuer {
  issueFor(user: IdentityUser): AuthTokens;
}

/** Framework-neutral injection token, bound by the adapter side. */
export const ACCESS_TOKEN_ISSUER = Symbol('ACCESS_TOKEN_ISSUER');
