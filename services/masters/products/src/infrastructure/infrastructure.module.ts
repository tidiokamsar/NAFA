import { Module } from '@nestjs/common';
import { PrismaModule } from './persistence/prisma/prisma.module';

/**
 * Every outbound adapter the service owns, and the single place where ports
 * are bound to implementations.
 *
 * PROD-002.2 scaffold: only the Prisma plumbing is wired. The two products
 * adapters (ProductRepository, ProductCodeUniquenessChecker) are bound here
 * in PROD-002.3.
 */
@Module({
  imports: [PrismaModule],
  exports: [PrismaModule],
})
export class InfrastructureModule {}
