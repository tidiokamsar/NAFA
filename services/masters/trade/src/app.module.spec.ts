import { Test, TestingModule } from '@nestjs/testing';
import { REDIS_CLIENT } from '@nafa/platform';
import { Clock, IdGenerator, SystemClock, UuidGenerator } from '@nafa/shared';
import {
  OFFER_REPOSITORY,
  PRODUCT_CATALOG,
  SELLER_REGISTRY,
} from '@nafa/trade';
import { AppModule } from './app.module';
import { PrismaOfferRepository } from './infrastructure/persistence/prisma/prisma-offer.repository';
import { PrismaProductCatalog } from './infrastructure/persistence/prisma/prisma-product-catalog.adapter';
import { PrismaSellerRegistry } from './infrastructure/persistence/prisma/prisma-seller-registry.adapter';
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
 * this test since Sprint 0 and was never affected (ADR-0014 §4).
 *
 * Needs neither Postgres nor Redis: only the providers that open sockets are
 * stubbed, everything else is the real graph.
 */
describe('AppModule wiring', () => {
  let moduleRef: TestingModule;

  const prismaStub = {
    $queryRaw: jest.fn(),
    offer: { findFirst: jest.fn(), findMany: jest.fn() },
    product: { findFirst: jest.fn() },
    actor: { findFirst: jest.fn() },
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

  it('binds every port to its adapter, SELLER_REGISTRY included', () => {
    // That token was deliberately unbound until ACTOR-002 shipped the actors
    // table. Asserting it here is what stops it quietly going back.
    expect(moduleRef.get(OFFER_REPOSITORY, { strict: false })).toBeInstanceOf(
      PrismaOfferRepository,
    );
    expect(moduleRef.get(PRODUCT_CATALOG, { strict: false })).toBeInstanceOf(
      PrismaProductCatalog,
    );
    expect(moduleRef.get(SELLER_REGISTRY, { strict: false })).toBeInstanceOf(
      PrismaSellerRegistry,
    );
  });

  it('hands the repository a real Clock and IdGenerator', () => {
    const repository = moduleRef.get(OFFER_REPOSITORY, {
      strict: false,
    }) as unknown as Record<string, unknown>;

    expect(repository['clock']).toBeInstanceOf(SystemClock);
    expect(repository['ids']).toBeInstanceOf(UuidGenerator);
    expect(repository['clock']).toBe(moduleRef.get(Clock, { strict: false }));
    expect(repository['ids']).toBe(
      moduleRef.get(IdGenerator, { strict: false }),
    );
  });
});
