import { Module } from '@nestjs/common';
import { PrismaModule } from './persistence/prisma/prisma.module';

/**
 * Every outbound adapter the service owns, and the single place where ports
 * are bound to implementations.
 *
 * GEO-002.2 scaffold: only the Prisma plumbing is wired. The four geography
 * adapters (CountryProfileRepository, AdministrativeAreaRepository,
 * AreaCodeUniquenessChecker, AreaSuccessionService) are bound here in
 * GEO-002.3.
 */
@Module({
  imports: [PrismaModule],
  exports: [PrismaModule],
})
export class InfrastructureModule {}
