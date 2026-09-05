import { Module } from '@nestjs/common';
import {
  PRODUCT_CODE_UNIQUENESS_CHECKER,
  PRODUCT_REPOSITORY,
} from '@nafa/products';
import { Clock, IdGenerator, SystemClock, UuidGenerator } from '@nafa/shared';
import { PrismaProductCodeUniquenessChecker } from './persistence/prisma/prisma-product-code-uniqueness.checker';
import { PrismaProductRepository } from './persistence/prisma/prisma-product.repository';
import { PrismaModule } from './persistence/prisma/prisma.module';

/**
 * Every outbound adapter the service owns, and the single place where ports
 * are bound to implementations. Only the port tokens leave this module —
 * the adapter classes stay internal, so nothing upstream can accidentally
 * depend on Prisma being the persistence layer.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    // Domain dependencies — real clock and UUID generator at runtime.
    { provide: Clock, useClass: SystemClock },
    { provide: IdGenerator, useClass: UuidGenerator },

    // Adapters
    PrismaProductRepository,
    PrismaProductCodeUniquenessChecker,

    // Port bindings
    { provide: PRODUCT_REPOSITORY, useExisting: PrismaProductRepository },
    {
      provide: PRODUCT_CODE_UNIQUENESS_CHECKER,
      useExisting: PrismaProductCodeUniquenessChecker,
    },
  ],
  exports: [PrismaModule, PRODUCT_REPOSITORY, PRODUCT_CODE_UNIQUENESS_CHECKER],
})
export class InfrastructureModule {}
