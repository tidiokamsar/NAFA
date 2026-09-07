import { Module } from '@nestjs/common';
import {
  ADMINISTRATIVE_AREA_REPOSITORY,
  COUNTRY_PROFILE_REPOSITORY,
  type AdministrativeAreaRepository,
  type CountryProfileRepository,
} from '@nafa/geography';
import { FindAreaUseCase, FindCountryUseCase } from '../../application';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module';
import { GeographyController } from './geography.controller';

/**
 * Composition root for the geography read slice.
 *
 * The use cases are built by factory rather than listed as providers: they
 * are plain classes with nothing from NestJS on them, and keeping the
 * container out of `application/` is what this ceremony buys.
 */
@Module({
  imports: [InfrastructureModule],
  controllers: [GeographyController],
  providers: [
    {
      provide: FindAreaUseCase,
      useFactory: (areas: AdministrativeAreaRepository) =>
        new FindAreaUseCase(areas),
      inject: [ADMINISTRATIVE_AREA_REPOSITORY],
    },
    {
      provide: FindCountryUseCase,
      useFactory: (profiles: CountryProfileRepository) =>
        new FindCountryUseCase(profiles),
      inject: [COUNTRY_PROFILE_REPOSITORY],
    },
  ],
})
export class GeographyApiModule {}
