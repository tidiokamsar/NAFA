import { ConflictException, Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  IDENTITY_USER_REPOSITORY,
  type IdentityUserRepository,
} from '../../../domain';
import { AccessTokenIssuer } from '../access-token.issuer';
import { AuthTokens } from '../auth-tokens';

/** bcrypt cost factor. Unchanged from the pre-refactor AuthService. */
const PASSWORD_HASH_ROUNDS = 10;

@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(IDENTITY_USER_REPOSITORY)
    private readonly users: IdentityUserRepository,
    private readonly tokens: AccessTokenIssuer,
  ) {}

  async execute(email: string, password: string): Promise<AuthTokens> {
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
    const user = await this.users.create(email, passwordHash);

    return this.tokens.issueFor(user);
  }
}
