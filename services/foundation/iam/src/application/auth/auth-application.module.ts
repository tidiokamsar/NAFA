import { DynamicModule, Module, ModuleMetadata } from '@nestjs/common';
import { AccessTokenIssuer } from './access-token.issuer';
import { LoginUserUseCase } from './use-cases/login-user.use-case';
import { RegisterUserUseCase } from './use-cases/register-user.use-case';

@Module({})
export class AuthApplicationModule {
  /**
   * The application layer names what it needs; the caller supplies it.
   *
   * Passing the adapter modules in — rather than importing them here — is the
   * whole point. A NestJS provider resolves against its own module's imports,
   * so importing `InfrastructureModule` from this file would be the only other
   * way to make the use cases resolvable, and it would put a hard dependency
   * from `application/` onto `infrastructure/`. The composition root (`api/`)
   * is the layer allowed to know about both.
   *
   * @param adapters modules exporting IDENTITY_USER_REPOSITORY and JwtService.
   */
  static withAdapters(
    adapters: NonNullable<ModuleMetadata['imports']>,
  ): DynamicModule {
    return {
      module: AuthApplicationModule,
      imports: adapters,
      providers: [AccessTokenIssuer, RegisterUserUseCase, LoginUserUseCase],
      // AccessTokenIssuer stays internal: it is an implementation detail of
      // how the use cases answer, not something the API layer should reach for.
      exports: [RegisterUserUseCase, LoginUserUseCase],
    };
  }
}
