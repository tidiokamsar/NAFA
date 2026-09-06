import { Module } from '@nestjs/common';
import { OFFER_REPOSITORY, PRODUCT_CATALOG } from '@nafa/trade';
import { Clock, IdGenerator, SystemClock, UuidGenerator } from '@nafa/shared';
import { PrismaProductCatalog } from './persistence/prisma/prisma-product-catalog.adapter';
import { PrismaOfferRepository } from './persistence/prisma/prisma-offer.repository';
import { PrismaModule } from './persistence/prisma/prisma.module';

/**
 * Every outbound adapter the service owns, and the single place where ports
 * are bound to implementations. Only the port tokens leave this module.
 *
 * Deliberately NOT bound: SELLER_REGISTRY. There is no actors table
 * anywhere — the Actor Master's persistence does not exist (its domain
 * lives in @nafa/foundation, its storage is an open item from the ACTOR-001
 * review). Binding a stub that always refuses would brick offer creation
 * for a reason invisible in the logs; binding one that always accepts would
 * silently drop invariant 2. The token stays unbound — Nest fails loudly
 * the day someone requests it — until the Actor Master gets its table
 * (ADR-0011 §3: existence questions belong to the ports).
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

    // Port bindings
    { provide: OFFER_REPOSITORY, useExisting: PrismaOfferRepository },
    { provide: PRODUCT_CATALOG, useExisting: PrismaProductCatalog },
  ],
  exports: [PrismaModule, OFFER_REPOSITORY, PRODUCT_CATALOG],
})
export class InfrastructureModule {}
