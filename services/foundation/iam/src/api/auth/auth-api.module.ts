import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthApplicationModule } from '../../application';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module';
import { AuthController } from './auth.controller';

/**
 * Composition root for the auth slice: the only place that knows both which
 * use cases exist and which adapters satisfy them. `PassportModule` stays
 * here because it exists for the guards, which are an HTTP concern.
 */
@Module({
  imports: [
    PassportModule,
    AuthApplicationModule.withAdapters([InfrastructureModule]),
  ],
  controllers: [AuthController],
})
export class AuthApiModule {}
