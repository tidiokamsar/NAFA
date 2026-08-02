import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import type { AuthConfig } from '@nafa/platform';
import { IDENTITY_USER_REPOSITORY } from '../domain';
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
    {
      provide: IDENTITY_USER_REPOSITORY,
      useExisting: PrismaIdentityUserRepository,
    },
  ],
  exports: [PrismaModule, JwtModule, IDENTITY_USER_REPOSITORY],
})
export class InfrastructureModule {}
