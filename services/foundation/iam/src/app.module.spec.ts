import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { REDIS_CLIENT } from '@nafa/platform';
import { AppModule } from './app.module';
import { AuthController } from './api/auth/auth.controller';
import {
  ACCESS_TOKEN_ISSUER,
  LoginUserUseCase,
  PASSWORD_HASHER,
  RegisterUserUseCase,
} from './application';
import { IDENTITY_USER_REPOSITORY } from './domain';
import { BcryptPasswordHasher } from './infrastructure/auth/bcrypt-password.hasher';
import { JwtAccessTokenIssuer } from './infrastructure/auth/jwt-access-token.issuer';
import { PrismaIdentityUserRepository } from './infrastructure/persistence/prisma/prisma-identity-user.repository';
import { PrismaService } from './infrastructure/persistence/prisma/prisma.service';

/**
 * Wiring test for the whole DI graph.
 *
 * `compile()` instantiates every singleton provider and throws on the first
 * unresolvable token, which is the one class of defect that neither `tsc` nor
 * the build can see: layering the service across four modules means a missing
 * `exports:` entry or a token bound in the wrong module compiles perfectly and
 * fails at boot. It matters more now than before — the use cases are plain
 * classes built by factory, so a mis-ordered `inject:` array would type-check
 * and hand a hasher to the parameter expecting a repository.
 *
 * The e2e suite would catch all of it too, but it needs a live Postgres and
 * Redis — this one needs neither, so it runs in CI on every push.
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

  it('binds every application port to its adapter', () => {
    expect(
      moduleRef.get(IDENTITY_USER_REPOSITORY, { strict: false }),
    ).toBeInstanceOf(PrismaIdentityUserRepository);
    expect(
      moduleRef.get(ACCESS_TOKEN_ISSUER, { strict: false }),
    ).toBeInstanceOf(JwtAccessTokenIssuer);
    expect(moduleRef.get(PASSWORD_HASHER, { strict: false })).toBeInstanceOf(
      BcryptPasswordHasher,
    );
  });

  it('hands the use cases the ports, not the adapter classes', () => {
    // The use cases are constructed from port tokens: if the adapters were
    // injected by class, swapping an implementation would mean editing them.
    const repository = moduleRef.get(IDENTITY_USER_REPOSITORY, {
      strict: false,
    });
    const issuer = moduleRef.get(ACCESS_TOKEN_ISSUER, { strict: false });
    const hasher = moduleRef.get(PASSWORD_HASHER, { strict: false });

    // Indexed by name because the collaborators are private: this asserts the
    // `inject:` array in AuthApiModule lines up with the constructor, which
    // type-checks even when the order is wrong (all three are objects).
    const useCases: Record<string, unknown>[] = [
      moduleRef.get(RegisterUserUseCase, { strict: false }),
      moduleRef.get(LoginUserUseCase, { strict: false }),
    ];

    for (const useCase of useCases) {
      expect(useCase['users']).toBe(repository);
      expect(useCase['tokens']).toBe(issuer);
      expect(useCase['passwords']).toBe(hasher);
    }
  });

  it('gives register and login the same issuer over one JwtService', () => {
    // Register and login must not drift apart in how they sign.
    const jwtService = moduleRef.get(JwtService, { strict: false });
    const issuer = moduleRef.get(ACCESS_TOKEN_ISSUER, { strict: false });

    expect(jwtService).toBeInstanceOf(JwtService);
    expect(issuer['jwtService']).toBe(jwtService);
    expect(
      moduleRef.get(RegisterUserUseCase, { strict: false })['tokens'],
    ).toBe(moduleRef.get(LoginUserUseCase, { strict: false })['tokens']);
  });

  it('keeps the use cases free of anything from the container', () => {
    // Plain classes: no @Injectable(), so Nest attached no metadata to them.
    // If this ever fails, someone put a decorator back on the application
    // layer and the factory wiring is no longer buying anything.
    for (const useCase of [RegisterUserUseCase, LoginUserUseCase]) {
      expect(Reflect.getMetadata('design:paramtypes', useCase)).toBeUndefined();
    }
  });
});
