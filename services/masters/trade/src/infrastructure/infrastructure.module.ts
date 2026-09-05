import { Module } from '@nestjs/common';
import { PrismaModule } from './persistence/prisma/prisma.module';

/**
 * Every outbound adapter the service owns, and the single place where ports
 * are bound to implementations.
 *
 * TRA-002.2 scaffold: only the Prisma plumbing is wired. TRA-002.3 binds
 * OfferRepository and ProductCatalog.
 *
 * Deliberately NOT bound yet: SELLER_REGISTRY. There is no actors table
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
  exports: [PrismaModule],
})
export class InfrastructureModule {}
