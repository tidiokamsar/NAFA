import { Module } from '@nestjs/common';
import {
  OFFER_REPOSITORY,
  PRODUCT_CATALOG,
  SELLER_REGISTRY,
} from '@nafa/trade';
import { Clock, IdGenerator, SystemClock, UuidGenerator } from '@nafa/shared';
import { PrismaProductCatalog } from './persistence/prisma/prisma-product-catalog.adapter';
import { PrismaOfferRepository } from './persistence/prisma/prisma-offer.repository';
import { PrismaSellerRegistry } from './persistence/prisma/prisma-seller-registry.adapter';
import { PrismaModule } from './persistence/prisma/prisma.module';

/**
 * Every outbound adapter the service owns, and the single place where ports
 * are bound to implementations. Only the port tokens leave this module.
 *
 * SELLER_REGISTRY was deliberately left unbound until ACTOR-002: there was
 * no actors table anywhere, and a stub that always refused would have
 * bricked offer creation invisibly, while one that always accepted would
 * have silently dropped invariant 2. The table now exists, so the token is
 * bound to a real adapter and an offer can finally name a seller that the
 * registry confirms (ADR-0011 §3, ADR-0012).
 */
@Module({
  imports: [PrismaModule],
  providers: [
    // Domain dependencies — real clock and UUID generator at runtime.
    { provide: Clock, useClass: SystemClock },
    { provide: IdGenerator, useClass: UuidGenerator },

    // Adapters
    PrismaOfferRepository,
    PrismaProductCatalog,
    PrismaSellerRegistry,

    // Port bindings
    { provide: OFFER_REPOSITORY, useExisting: PrismaOfferRepository },
    { provide: PRODUCT_CATALOG, useExisting: PrismaProductCatalog },
    { provide: SELLER_REGISTRY, useExisting: PrismaSellerRegistry },
  ],
  exports: [PrismaModule, OFFER_REPOSITORY, PRODUCT_CATALOG, SELLER_REGISTRY],
})
export class InfrastructureModule {}
