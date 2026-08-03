/**
 * Failures the authentication use cases report.
 *
 * These are plain `Error` subclasses on purpose. A use case that threw
 * `ConflictException` would only be reusable behind HTTP — the same logic
 * driven from a queue consumer, a CLI or a scheduled job would be throwing
 * status codes at something that has none. Translating to HTTP is the API
 * layer's job; see `api/auth/auth-error.mapper.ts`.
 *
 * The messages are part of the public API surface and are asserted by the e2e
 * suite: they are the exact strings the service returned before the layers
 * were split apart.
 */
export abstract class AuthApplicationError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class EmailAlreadyRegisteredError extends AuthApplicationError {
  constructor() {
    super('Email already registered');
  }
}

export class InvalidCredentialsError extends AuthApplicationError {
  /**
   * Raised both for an unknown email and for a wrong password, with the same
   * message. Telling the two apart hands an attacker a way to enumerate
   * registered accounts.
   */
  constructor() {
    super('Invalid credentials');
  }
}
