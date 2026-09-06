import { Module } from '@nestjs/common';
import {
  ACTOR_REPOSITORY,
  COOPERATIVE_MEMBERSHIP_REPOSITORY,
} from '@nafa/foundation';
import { Clock, IdGenerator, SystemClock, UuidGenerator } from '@nafa/shared';
import { PrismaActorRepository } from './persistence/prisma/prisma-actor.repository';
import { PrismaCooperativeMembershipRepository } from './persistence/prisma/prisma-cooperative-membership.repository';
import { PrismaModule } from './persistence/prisma/prisma.module';

/**
 * Every outbound adapter the service owns, and the single place where ports
 * are bound to implementations. Only the port tokens leave this module.
 *
 * Both repositories are bound here — the Actor Master is the last reference
 * Master to get its persistence, and with it the registry that the trade
 * service's SellerRegistry reads. Nothing is left unbound.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    // Domain dependencies — real clock and UUID generator at runtime.
    { provide: Clock, useClass: SystemClock },
    { provide: IdGenerator, useClass: UuidGenerator },

    // Adapters
    PrismaActorRepository,
    PrismaCooperativeMembershipRepository,

    // Port bindings
    { provide: ACTOR_REPOSITORY, useExisting: PrismaActorRepository },
    {
      provide: COOPERATIVE_MEMBERSHIP_REPOSITORY,
      useExisting: PrismaCooperativeMembershipRepository,
    },
  ],
  exports: [PrismaModule, ACTOR_REPOSITORY, COOPERATIVE_MEMBERSHIP_REPOSITORY],
})
export class InfrastructureModule {}
