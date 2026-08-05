import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import {
  ACCESS_TOKEN_ISSUER,
  LoginUserUseCase,
  PASSWORD_HASHER,
  RegisterUserUseCase,
  type AccessTokenIssuer,
  type PasswordHasher,
} from '../../application';
import {
  IDENTITY_USER_REPOSITORY,
  type IdentityUserRepository,
} from '../../domain';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module';
import { AuthController } from './auth.controller';

/**
 * Composition root for the auth slice: the only place that knows both which
 * use cases exist and which adapters satisfy them.
 *
 * The use cases are built by factory rather than listed as providers, because
 * they are plain classes — no `@Injectable()`, no `@Inject()`, nothing from
 * NestJS at all. Keeping the container out of `application/` is the point of
 * this wiring, and the small amount of ceremony here is what buys it.
 *
 * `PassportModule` stays here because it exists for the guards, which are an
 * HTTP concern.
 */
@Module({
  imports: [PassportModule, InfrastructureModule],
  controllers: [AuthController],
  providers: [
    {
      provide: RegisterUserUseCase,
      useFactory: (
        users: IdentityUserRepository,
        passwords: PasswordHasher,
        tokens: AccessTokenIssuer,
      ) => new RegisterUserUseCase(users, passwords, tokens),
      inject: [IDENTITY_USER_REPOSITORY, PASSWORD_HASHER, ACCESS_TOKEN_ISSUER],
    },
    {
      provide: LoginUserUseCase,
      useFactory: (
        users: IdentityUserRepository,
        passwords: PasswordHasher,
        tokens: AccessTokenIssuer,
      ) => new LoginUserUseCase(users, passwords, tokens),
      inject: [IDENTITY_USER_REPOSITORY, PASSWORD_HASHER, ACCESS_TOKEN_ISSUER],
    },
  ],
})
export class AuthApiModule {}
