import { Test, TestingModule } from '@nestjs/testing';
import { REDIS_CLIENT } from '@nafa/platform';
import { Clock, IdGenerator, SystemClock, UuidGenerator } from '@nafa/shared';
import {
  ACTOR_REPOSITORY,
  COOPERATIVE_MEMBERSHIP_REPOSITORY,
} from '@nafa/foundation';
import { AppModule } from './app.module';
import { PrismaActorRepository } from './infrastructure/persistence/prisma/prisma-actor.repository';
import { PrismaCooperativeMembershipRepository } from './infrastructure/persistence/prisma/prisma-cooperative-membership.repository';
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
    actor: { findFirst: jest.fn(), findMany: jest.fn() },
    cooperativeMembership: { findFirst: jest.fn(), findMany: jest.fn() },
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
    expect(moduleRef.get(ACTOR_REPOSITORY, { strict: false })).toBeInstanceOf(
      PrismaActorRepository,
    );
    expect(
      moduleRef.get(COOPERATIVE_MEMBERSHIP_REPOSITORY, { strict: false }),
    ).toBeInstanceOf(PrismaCooperativeMembershipRepository);
  });

  it('hands both repositories a real Clock and IdGenerator', () => {
    const clock = moduleRef.get(Clock, { strict: false });
    const ids = moduleRef.get(IdGenerator, { strict: false });

    for (const token of [ACTOR_REPOSITORY, COOPERATIVE_MEMBERSHIP_REPOSITORY]) {
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
});
