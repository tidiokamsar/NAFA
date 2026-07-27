/**
 * CSRF protection — contracts only, no implementation yet.
 *
 * NAFA services authenticate with a bearer token in the `Authorization`
 * header, which a browser does not attach automatically, so they are not
 * currently vulnerable to CSRF. The moment any surface moves to cookie-based
 * sessions (the web portals may), this becomes mandatory rather than optional.
 *
 * Defining the shape now means that switch is a wiring change, not a redesign.
 */

export interface CsrfOptions {
  /** Cookie holding the secret the token is derived from. */
  cookieName: string;
  /** Header the client echoes the token back in. */
  headerName: string;
  /** Methods to protect. Safe methods must stay excluded. */
  protectedMethods: string[];
  cookie: {
    httpOnly: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    secure: boolean;
    path: string;
  };
}

export const defaultCsrfOptions: CsrfOptions = {
  cookieName: '__Host-nafa.csrf',
  headerName: 'x-csrf-token',
  protectedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  cookie: {
    httpOnly: true,
    // `strict` breaks inbound links from other sites; `lax` is the usual
    // compromise and still blocks cross-site POSTs.
    sameSite: 'lax',
    secure: true,
    path: '/',
  },
};

/**
 * What an implementation must provide. Wire a library such as `csrf-csrf`
 * behind this interface rather than calling it directly from services.
 */
export interface CsrfProtection {
  /** Issues a token for the current session and sets the paired cookie. */
  issueToken(request: unknown, response: unknown): string;
  /** True when the submitted token matches the cookie secret. */
  validate(request: unknown): boolean;
}
