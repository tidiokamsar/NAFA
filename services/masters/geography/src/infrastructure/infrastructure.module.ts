import { Module } from '@nestjs/common';
import {
  ADMINISTRATIVE_AREA_REPOSITORY,
  AREA_CODE_UNIQUENESS_CHECKER,
  AREA_SUCCESSION_SERVICE,
  COUNTRY_PROFILE_REPOSITORY,
} from '@nafa/geography';
import { Clock, IdGenerator, SystemClock, UuidGenerator } from '@nafa/shared';
import { PrismaAreaCodeUniquenessChecker } from './persistence/prisma/prisma-area-code-uniqueness.checker';
import { PrismaAreaSuccessionService } from './persistence/prisma/prisma-area-succession.service';
import { PrismaAdministrativeAreaRepository } from './persistence/prisma/prisma-administrative-area.repository';
import { PrismaCountryProfileRepository } from './persistence/prisma/prisma-country-profile.repository';
import { PrismaModule } from './persistence/prisma/prisma.module';

/**
 * Every outbound adapter the service owns, and the single place where ports
 * are bound to implementations.
 *
 * The four geography ports are bound to their Prisma adapters via
 * `useExisting`, mirroring IAM's InfrastructureModule. Only the port tokens
 * leave this module — the adapter classes stay internal, so nothing upstream
 * can accidentally depend on Prisma being the persistence layer.
 *
 * Clock and IdGenerator are bound to their real implementations: rehydrated
 * aggregates only use them when a mutation generates a domain event, never on
 * a read.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    // Domain dependencies — real clock and UUID generator at runtime.
    { provide: Clock, useClass: SystemClock },
    { provide: IdGenerator, useClass: UuidGenerator },

    // Adapters
    PrismaCountryProfileRepository,
    PrismaAdministrativeAreaRepository,
    PrismaAreaCodeUniquenessChecker,
    PrismaAreaSuccessionService,

    // Port bindings
    {
      provide: COUNTRY_PROFILE_REPOSITORY,
      useExisting: PrismaCountryProfileRepository,
    },
    {
      provide: ADMINISTRATIVE_AREA_REPOSITORY,
      useExisting: PrismaAdministrativeAreaRepository,
    },
    {
      provide: AREA_CODE_UNIQUENESS_CHECKER,
      useExisting: PrismaAreaCodeUniquenessChecker,
    },
    {
      provide: AREA_SUCCESSION_SERVICE,
      useExisting: PrismaAreaSuccessionService,
    },
  ],
  exports: [
    PrismaModule,
    COUNTRY_PROFILE_REPOSITORY,
    ADMINISTRATIVE_AREA_REPOSITORY,
    AREA_CODE_UNIQUENESS_CHECKER,
    AREA_SUCCESSION_SERVICE,
  ],
})
export class InfrastructureModule {}
