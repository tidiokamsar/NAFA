import { Test, TestingModule } from '@nestjs/testing';
import { REDIS_CLIENT } from '@nafa/platform';
import {
  PRODUCT_REPOSITORY,
  PRODUCT_CODE_UNIQUENESS_CHECKER,
} from '@nafa/products';
import { Clock, IdGenerator, SystemClock, UuidGenerator } from '@nafa/shared';
import { AppModule } from './app.module';
import { ProductsController } from './api/products/products.controller';
import { FindProductUseCase } from './application';
import { PrismaProductRepository } from './infrastructure/persistence/prisma/prisma-product.repository';
import { PrismaService } from './infrastructure/persistence/prisma/prisma.service';

/**
 * Wiring test for the whole DI graph — the guard the Masters did not have.
 *
 * `compile()` instantiates every singleton and throws on the first
 * unresolvable token. That is the one class of defect neither `tsc` nor the
 * build can see, and this service shipped with exactly one: the repository
 * imported `Clock` and `IdGenerator` as *types*, which TypeScript erases, so
 * `emitDecoratorMetadata` recorded `Function` and Nest had no token to
 * resolve. It type-checked, it built, and the application could not boot.
 *
 * Nothing caught it because nothing ever booted a Master's module — the
 * adapter e2e suites construct repositories by hand with `new`. IAM has had
 * this test since Sprint 0 and was never affected.
 *
 * Needs neither Postgres nor Redis: only the two providers that open sockets
 * are stubbed, everything else is the real graph.
 */
describe('AppModule wiring', () => {
  let moduleRef: TestingModule;

  const prismaStub = {
    $queryRaw: jest.fn(),
    product: { findFirst: jest.fn(), findMany: jest.fn() },
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
    expect(moduleRef.get(PRODUCT_REPOSITORY, { strict: false })).toBeInstanceOf(
      PrismaProductRepository,
    );
    expect(
      moduleRef.get(PRODUCT_CODE_UNIQUENESS_CHECKER, { strict: false }),
    ).toBeDefined();
  });

  it('hands the repository a real Clock and IdGenerator', () => {
    // The assertion that would have caught the erased-token bug. A `type`
    // import leaves these undefined at construction time, and every write
    // would have failed on the first `clock.nowIso()` — if the module had
    // been able to start at all.
    const repository = moduleRef.get(PRODUCT_REPOSITORY, {
      strict: false,
    }) as PrismaProductRepository;

    expect(repository['clock']).toBeInstanceOf(SystemClock);
    expect(repository['ids']).toBeInstanceOf(UuidGenerator);
    expect(repository['clock']).toBe(moduleRef.get(Clock, { strict: false }));
    expect(repository['ids']).toBe(
      moduleRef.get(IdGenerator, { strict: false }),
    );
  });

  it('resolves the controller with its use case', () => {
    const controller = moduleRef.get(ProductsController, { strict: false });

    expect(controller).toBeInstanceOf(ProductsController);
    expect(controller['products']).toBeInstanceOf(FindProductUseCase);
  });

  it('hands the use case the port, not the adapter class', () => {
    // Built from the port token: swapping the implementation must not mean
    // editing the use case.
    const useCase = moduleRef.get(FindProductUseCase, {
      strict: false,
    }) as unknown as Record<string, unknown>;

    expect(useCase['products']).toBe(
      moduleRef.get(PRODUCT_REPOSITORY, { strict: false }),
    );
  });

  it('keeps the use case free of anything from the container', () => {
    // A plain class: no @Injectable(), so Nest attached no metadata. If this
    // fails, someone put a decorator back on the application layer and the
    // factory wiring stopped buying anything.
    expect(
      Reflect.getMetadata('design:paramtypes', FindProductUseCase),
    ).toBeUndefined();
  });
});
