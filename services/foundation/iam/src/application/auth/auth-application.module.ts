import { DynamicModule, Module, ModuleMetadata } from '@nestjs/common';
import { AuthService } from './auth.service';

@Module({})
export class AuthApplicationModule {
  /**
   * The application layer names what it needs; the caller supplies it.
   *
   * Passing the adapter modules in — rather than importing them here — is the
   * whole point. A NestJS provider resolves against its own module's imports,
   * so importing `InfrastructureModule` from this file would be the only other
   * way to make `AuthService` resolvable, and it would put a hard dependency
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
      providers: [AuthService],
      exports: [AuthService],
    };
  }
}
