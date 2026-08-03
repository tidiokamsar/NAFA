import type { IdentityUserRepository } from '../../../domain';
import type { AuthTokens } from '../auth-tokens';
import { EmailAlreadyRegisteredError } from '../auth.errors';
import type { AccessTokenIssuer } from '../ports/access-token-issuer.port';
import type { PasswordHasher } from '../ports/password-hasher.port';

/**
 * A plain class: no decorators, no container awareness, everything it needs
 * arrives through the constructor. The composition root in `api/` is what
 * turns it into a NestJS provider.
 */
export class RegisterUserUseCase {
  constructor(
    private readonly users: IdentityUserRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: AccessTokenIssuer,
  ) {}

  async execute(email: string, password: string): Promise<AuthTokens> {
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new EmailAlreadyRegisteredError();
    }

    const passwordHash = await this.passwords.hash(password);
    const user = await this.users.create(email, passwordHash);

    return this.tokens.issueFor(user);
  }
}
