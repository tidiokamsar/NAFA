import { Module } from '@nestjs/common';
import { IDENTITY_USER_REPOSITORY } from '../domain';
import { JwtStrategy } from './auth/jwt.strategy';
import { PrismaIdentityUserRepository } from './persistence/prisma/prisma-identity-user.repository';
import { PrismaModule } from './persistence/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [
    JwtStrategy,
    PrismaIdentityUserRepository,
    {
      provide: IDENTITY_USER_REPOSITORY,
      useExisting: PrismaIdentityUserRepository,
    },
  ],
  exports: [PrismaModule, IDENTITY_USER_REPOSITORY],
})
export class InfrastructureModule {}
