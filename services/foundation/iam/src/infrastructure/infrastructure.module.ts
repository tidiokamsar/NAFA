import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import type { AuthConfig } from '@nafa/platform';
import { ACCESS_TOKEN_ISSUER, PASSWORD_HASHER } from '../application';
import { IDENTITY_USER_REPOSITORY } from '../domain';
import { BcryptPasswordHasher } from './auth/bcrypt-password.hasher';
import { JwtAccessTokenIssuer } from './auth/jwt-access-token.issuer';
import { JwtStrategy } from './auth/jwt.strategy';
import { PrismaIdentityUserRepository } from './persistence/prisma/prisma-identity-user.repository';
import { PrismaModule } from './persistence/prisma/prisma.module';

type SignOptions = NonNullable<JwtModuleOptions['signOptions']>;

/**
 * Every outbound adapter the service owns, and the single place where ports
 * are bound to implementations. Signing keys and database handles are both
 * infrastructure: the layers above ask for `JwtService` and
 * `IDENTITY_USER_REPOSITORY` without knowing where either comes from.
 */
@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const auth = config.getOrThrow<AuthConfig>('auth');
        return {
          secret: auth.jwtSecret,
          signOptions: {
            // `expiresIn` is typed as the `ms` StringValue union; the value is
            // validated as a plain string at boot (platform env validation).
            expiresIn: auth.jwtExpiresIn as SignOptions['expiresIn'],
          },
        };
      },
    }),
  ],
  providers: [
    JwtStrategy,
    PrismaIdentityUserRepository,
    JwtAccessTokenIssuer,
    BcryptPasswordHasher,
    {
      provide: IDENTITY_USER_REPOSITORY,
      useExisting: PrismaIdentityUserRepository,
    },
    { provide: ACCESS_TOKEN_ISSUER, useExisting: JwtAccessTokenIssuer },
    { provide: PASSWORD_HASHER, useExisting: BcryptPasswordHasher },
  ],
  // Only the port tokens leave this module. The adapter classes stay internal,
  // so nothing upstream can accidentally depend on `JwtService` being the
  // thing that signs, or on bcrypt being the thing that hashes.
  exports: [
    PrismaModule,
    IDENTITY_USER_REPOSITORY,
    ACCESS_TOKEN_ISSUER,
    PASSWORD_HASHER,
  ],
})
export class InfrastructureModule {}
