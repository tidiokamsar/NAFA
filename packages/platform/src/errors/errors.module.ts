import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter';

/**
 * Installs {@link AllExceptionsFilter} as the application-wide filter.
 * Registering it through APP_FILTER (rather than `app.useGlobalFilters`) keeps
 * it inside the DI container, which is what lets it inject the logger.
 */
@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class PlatformErrorsModule {}
