import { Test, TestingModule } from '@nestjs/testing';
import { REDIS_CLIENT } from '@nafa/platform';
import { Clock, IdGenerator, SystemClock, UuidGenerator } from '@nafa/shared';
import {
  ADMINISTRATIVE_AREA_REPOSITORY,
  AREA_CODE_UNIQUENESS_CHECKER,
  AREA_SUCCESSION_SERVICE,
  COUNTRY_PROFILE_REPOSITORY,
} from '@nafa/geography';
import { AppModule } from './app.module';
import { GeographyController } from './api/geography/geography.controller';
import { FindAreaUseCase, FindCountryUseCase } from './application';
import { PrismaAdministrativeAreaRepository } from './infrastructure/persistence/prisma/prisma-administrative-area.repository';
import { PrismaCountryProfileRepository } from './infrastructure/persistence/prisma/prisma-country-profile.repository';
import { PrismaService } from './infrastructure/persistence/prisma/prisma.service';

/**
 * Wiring test for the whole DI graph — the guard the Masters did not have.
 *
 * `compile()` instantiates every singleton and throws on the first
 * unresolvable token. That is the one class of defect neither `tsc` nor the
 * build can see, and this service shipped with exactly one: the repositories
 * imported `Clock` and `IdGenerator` as *types*, which TypeScript erases, so
 * `emitDecoratorMetadata` recorded `Function` and Nest had no token to
 * resolve. It type-checked, it built, and the application could not boot.
 *
 * Nothing caught it because nothing ever booted a Master's module — the
 * adapter e2e suites construct repositories by hand with `new`. IAM has had
 * this test since Sprint 0 and was never affected (ADR-0014 §4).
 *
 * Needs neither Postgres nor Redis: only the providers that open sockets are
 * stubbed, everything else is the real graph.
 */
describe('AppModule wiring', () => {
  let moduleRef: TestingModule;

  const prismaStub = {
    $queryRaw: jest.fn(),
    administrativeArea: { findFirst: jest.fn(), findMany: jest.fn() },
    countryProfile: { findFirst: jest.fn(), findMany: jest.fn() },
  };

  const redisStub = {
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue('OK'),
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .overrideProvider(REDIS_CLIENT)
      .useValue(redisStub)
      .compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('binds every port to its adapter', () => {
    expect(
      moduleRef.get(ADMINISTRATIVE_AREA_REPOSITORY, { strict: false }),
    ).toBeInstanceOf(PrismaAdministrativeAreaRepository);
    expect(
      moduleRef.get(COUNTRY_PROFILE_REPOSITORY, { strict: false }),
    ).toBeInstanceOf(PrismaCountryProfileRepository);
    expect(
      moduleRef.get(AREA_CODE_UNIQUENESS_CHECKER, { strict: false }),
    ).toBeDefined();
    expect(
      moduleRef.get(AREA_SUCCESSION_SERVICE, { strict: false }),
    ).toBeDefined();
  });

  it('hands both repositories a real Clock and IdGenerator', () => {
    // The assertion that would have caught the erased-token bug: a `type`
    // import leaves these undefined, and the first `clock.nowIso()` in a
    // write would have thrown — if the module could start at all.
    const clock = moduleRef.get(Clock, { strict: false });
    const ids = moduleRef.get(IdGenerator, { strict: false });

    for (const token of [
      ADMINISTRATIVE_AREA_REPOSITORY,
      COUNTRY_PROFILE_REPOSITORY,
    ]) {
      const repository = moduleRef.get(token, { strict: false }) as Record<
        string,
        unknown
      >;
      expect(repository['clock']).toBe(clock);
      expect(repository['ids']).toBe(ids);
    }

    expect(clock).toBeInstanceOf(SystemClock);
    expect(ids).toBeInstanceOf(UuidGenerator);
  });

  it('resolves the controller with both use cases', () => {
    const controller = moduleRef.get(GeographyController, { strict: false });

    expect(controller).toBeInstanceOf(GeographyController);
    expect(controller['areas']).toBeInstanceOf(FindAreaUseCase);
    expect(controller['countries']).toBeInstanceOf(FindCountryUseCase);
  });

  it('hands the use cases the ports, not the adapter classes', () => {
    const areaUseCase = moduleRef.get(FindAreaUseCase, {
      strict: false,
    }) as unknown as Record<string, unknown>;
    const countryUseCase = moduleRef.get(FindCountryUseCase, {
      strict: false,
    }) as unknown as Record<string, unknown>;

    expect(areaUseCase['areas']).toBe(
      moduleRef.get(ADMINISTRATIVE_AREA_REPOSITORY, { strict: false }),
    );
    expect(countryUseCase['profiles']).toBe(
      moduleRef.get(COUNTRY_PROFILE_REPOSITORY, { strict: false }),
    );
  });

  it('keeps the use cases free of anything from the container', () => {
    // Plain classes: no @Injectable(), so Nest attached no metadata. If this
    // fails, someone put a decorator back on the application layer.
    for (const useCase of [FindAreaUseCase, FindCountryUseCase]) {
      expect(Reflect.getMetadata('design:paramtypes', useCase)).toBeUndefined();
    }
  });
});
