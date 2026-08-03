import type { IdentityUserRepository } from '../../../domain';
import type { AuthTokens } from '../auth-tokens';
import { InvalidCredentialsError } from '../auth.errors';
import type { AccessTokenIssuer } from '../ports/access-token-issuer.port';
import type { PasswordHasher } from '../ports/password-hasher.port';

export class LoginUserUseCase {
  constructor(
    private readonly users: IdentityUserRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: AccessTokenIssuer,
  ) {}

  async execute(email: string, password: string): Promise<AuthTokens> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      // Same error as a bad password on purpose: telling the two apart hands
      // an attacker a way to enumerate registered emails.
      throw new InvalidCredentialsError();
    }

    const valid = await this.passwords.compare(password, user.passwordHash);
    if (!valid) {
      throw new InvalidCredentialsError();
    }

    return this.tokens.issueFor(user);
  }
}
