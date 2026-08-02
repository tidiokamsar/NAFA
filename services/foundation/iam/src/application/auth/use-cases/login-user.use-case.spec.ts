import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import {
  IDENTITY_USER_REPOSITORY,
  type IdentityUser,
  type IdentityUserRepository,
} from '../../../domain';
import { AccessTokenIssuer } from '../access-token.issuer';
import { LoginUserUseCase } from './login-user.use-case';

function userFixture(overrides: Partial<IdentityUser> = {}): IdentityUser {
  return {
    id: 'user-id',
    email: 'user@nafa.gn',
    passwordHash: 'hash',
    ...overrides,
  };
}

describe('LoginUserUseCase', () => {
  let loginUser: LoginUserUseCase;
  let usersRepository: jest.Mocked<IdentityUserRepository>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LoginUserUseCase,
        AccessTokenIssuer,
        {
          provide: IDENTITY_USER_REPOSITORY,
          useValue: {
            findByEmail: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('signed.jwt.token'),
          },
        },
      ],
    }).compile();

    loginUser = moduleRef.get(LoginUserUseCase);
    usersRepository = moduleRef.get(IDENTITY_USER_REPOSITORY);
    jwtService = moduleRef.get(JwtService);
  });

  it('rejects an unknown email', async () => {
    usersRepository.findByEmail.mockResolvedValue(null);

    await expect(
      loginUser.execute('ghost@nafa.gn', 'password123'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an incorrect password', async () => {
    usersRepository.findByEmail.mockResolvedValue(
      userFixture({
        id: 'u3',
        passwordHash: await bcrypt.hash('correct-password', 10),
      }),
    );

    await expect(
      loginUser.execute('user@nafa.gn', 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not let an unknown email be told apart from a wrong password', async () => {
    usersRepository.findByEmail.mockResolvedValue(null);
    const unknownEmail = await loginUser
      .execute('ghost@nafa.gn', 'password123')
      .catch((error: UnauthorizedException) => error);

    usersRepository.findByEmail.mockResolvedValue(
      userFixture({ passwordHash: await bcrypt.hash('correct-password', 10) }),
    );
    const wrongPassword = await loginUser
      .execute('user@nafa.gn', 'wrong-password')
      .catch((error: UnauthorizedException) => error);

    expect(unknownEmail).toBeInstanceOf(UnauthorizedException);
    expect(wrongPassword).toBeInstanceOf(UnauthorizedException);
    expect((unknownEmail as UnauthorizedException).getResponse()).toEqual(
      (wrongPassword as UnauthorizedException).getResponse(),
    );
  });

  it('returns a token for valid credentials', async () => {
    usersRepository.findByEmail.mockResolvedValue(
      userFixture({
        id: 'u4',
        passwordHash: await bcrypt.hash('correct-password', 10),
      }),
    );

    await expect(
      loginUser.execute('user@nafa.gn', 'correct-password'),
    ).resolves.toEqual({ accessToken: 'signed.jwt.token' });
    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: 'u4',
      email: 'user@nafa.gn',
    });
  });
});
