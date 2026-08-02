import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { AuthConfig } from '@nafa/platform';
import { AuthService } from '../../application';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module';
import { AuthController } from './auth.controller';

type SignOptions = NonNullable<JwtModuleOptions['signOptions']>;

@Module({
  imports: [
    InfrastructureModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const auth = config.getOrThrow<AuthConfig>('auth');
        return {
          secret: auth.jwtSecret,
          signOptions: {
            expiresIn: auth.jwtExpiresIn as SignOptions['expiresIn'],
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthApiModule {}
