import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  IDENTITY_USER_REPOSITORY,
  type IdentityUserRepository,
} from '../../../domain';
import { AccessTokenIssuer } from '../access-token.issuer';
import { AuthTokens } from '../auth-tokens';

@Injectable()
export class LoginUserUseCase {
  constructor(
    @Inject(IDENTITY_USER_REPOSITORY)
    private readonly users: IdentityUserRepository,
    private readonly tokens: AccessTokenIssuer,
  ) {}

  async execute(email: string, password: string): Promise<AuthTokens> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      // Same exception and message as a bad password on purpose: telling the
      // two apart hands an attacker a way to enumerate registered emails.
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.tokens.issueFor(user);
  }
}
