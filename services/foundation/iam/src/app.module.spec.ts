import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { REDIS_CLIENT } from '@nafa/platform';
import { AppModule } from './app.module';
import { AuthController } from './api/auth/auth.controller';
import { AuthService } from './application';
import { IDENTITY_USER_REPOSITORY } from './domain';
import { PrismaIdentityUserRepository } from './infrastructure/persistence/prisma/prisma-identity-user.repository';
import { PrismaService } from './infrastructure/persistence/prisma/prisma.service';

/**
 * Wiring test for the whole DI graph.
 *
 * `compile()` instantiates every singleton provider and throws on the first
 * unresolvable token, which is the one class of defect that neither `tsc` nor
 * the build can see: layering the service across four modules means a missing
 * `exports:` entry or a token bound in the wrong module compiles perfectly and
 * fails at boot. The e2e suite would catch it too, but it needs a live
 * Postgres and Redis — this one needs neither, so it runs in CI on every push.
 *
 * Only the two providers that open sockets are replaced. Everything else is
 * the real graph, including the dynamic modules.
 */
describe('AppModule wiring', () => {
  let moduleRef: TestingModule;

  const prismaStub = {
    $queryRaw: jest.fn(),
    user: { findUnique: jest.fn(), create: jest.fn() },
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

  it('resolves the auth controller with its use case collaborator', () => {
    const controller = moduleRef.get(AuthController, { strict: false });

    expect(controller).toBeInstanceOf(AuthController);
    expect(controller['authService']).toBeInstanceOf(AuthService);
  });

  it('binds the identity port to the Prisma adapter', () => {
    const repository = moduleRef.get(IDENTITY_USER_REPOSITORY, {
      strict: false,
    });

    expect(repository).toBeInstanceOf(PrismaIdentityUserRepository);
  });

  it('hands the application layer the port, not the adapter class', () => {
    // AuthService is constructed with @Inject(IDENTITY_USER_REPOSITORY): if the
    // adapter were injected by class, swapping the implementation would mean
    // editing the use case.
    const authService = moduleRef.get(AuthService, { strict: false });
    const repository = moduleRef.get(IDENTITY_USER_REPOSITORY, {
      strict: false,
    });

    expect(authService['users']).toBe(repository);
  });

  it('exposes a single JwtService to the layer that signs tokens', () => {
    const jwtService = moduleRef.get(JwtService, { strict: false });
    const authService = moduleRef.get(AuthService, { strict: false });

    expect(jwtService).toBeInstanceOf(JwtService);
    expect(authService['jwtService']).toBe(jwtService);
  });
});
