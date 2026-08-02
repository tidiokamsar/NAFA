import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { REDIS_CLIENT } from '@nafa/platform';
import { AppModule } from './app.module';
import { AuthController } from './api/auth/auth.controller';
import { LoginUserUseCase, RegisterUserUseCase } from './application';
// Imported by path, not through the barrel: the issuer is internal to the
// application layer and this test asserts exactly that.
import { AccessTokenIssuer } from './application/auth/access-token.issuer';
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

  it('resolves the auth controller with both use cases', () => {
    const controller = moduleRef.get(AuthController, { strict: false });

    expect(controller).toBeInstanceOf(AuthController);
    expect(controller['registerUser']).toBeInstanceOf(RegisterUserUseCase);
    expect(controller['loginUser']).toBeInstanceOf(LoginUserUseCase);
  });

  it('binds the identity port to the Prisma adapter', () => {
    const repository = moduleRef.get(IDENTITY_USER_REPOSITORY, {
      strict: false,
    });

    expect(repository).toBeInstanceOf(PrismaIdentityUserRepository);
  });

  it('hands the use cases the port, not the adapter class', () => {
    // The use cases are constructed with @Inject(IDENTITY_USER_REPOSITORY): if
    // the adapter were injected by class, swapping the implementation would
    // mean editing them.
    const repository = moduleRef.get(IDENTITY_USER_REPOSITORY, {
      strict: false,
    });

    expect(moduleRef.get(RegisterUserUseCase, { strict: false })['users']).toBe(
      repository,
    );
    expect(moduleRef.get(LoginUserUseCase, { strict: false })['users']).toBe(
      repository,
    );
  });

  it('mints both tokens from one issuer over one JwtService', () => {
    // Register and login must not drift apart in how they sign.
    const jwtService = moduleRef.get(JwtService, { strict: false });
    const registerIssuer = moduleRef.get(RegisterUserUseCase, {
      strict: false,
    })['tokens'];
    const loginIssuer = moduleRef.get(LoginUserUseCase, { strict: false })[
      'tokens'
    ];

    expect(jwtService).toBeInstanceOf(JwtService);
    expect(registerIssuer).toBeInstanceOf(AccessTokenIssuer);
    expect(registerIssuer).toBe(loginIssuer);
    expect(registerIssuer['jwtService']).toBe(jwtService);
  });

  it('keeps the token issuer out of reach of the API layer', () => {
    // AccessTokenIssuer is provided but deliberately not exported: the HTTP
    // layer signs nothing of its own.
    expect(() => moduleRef.get(AccessTokenIssuer, { strict: true })).toThrow();
  });
});
