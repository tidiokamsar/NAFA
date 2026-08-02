import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import {
  IDENTITY_USER_REPOSITORY,
  type IdentityUser,
  type IdentityUserRepository,
} from '../../../domain';
import { AccessTokenIssuer } from '../access-token.issuer';
import { RegisterUserUseCase } from './register-user.use-case';

function userFixture(overrides: Partial<IdentityUser> = {}): IdentityUser {
  return {
    id: 'user-id',
    email: 'user@nafa.gn',
    passwordHash: 'hash',
    ...overrides,
  };
}

describe('RegisterUserUseCase', () => {
  let registerUser: RegisterUserUseCase;
  let usersRepository: jest.Mocked<IdentityUserRepository>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RegisterUserUseCase,
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

    registerUser = moduleRef.get(RegisterUserUseCase);
    usersRepository = moduleRef.get(IDENTITY_USER_REPOSITORY);
    jwtService = moduleRef.get(JwtService);
  });

  it('rejects an email that is already registered', async () => {
    usersRepository.findByEmail.mockResolvedValue(
      userFixture({ id: 'u1', email: 'existing@nafa.gn' }),
    );

    await expect(
      registerUser.execute('existing@nafa.gn', 'password123'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('never lets the plaintext password reach the repository', async () => {
    usersRepository.findByEmail.mockResolvedValue(null);
    usersRepository.create.mockResolvedValue(
      userFixture({ id: 'u2', email: 'new@nafa.gn', passwordHash: 'hashed' }),
    );

    await registerUser.execute('new@nafa.gn', 'password123');

    const [, storedHash] = usersRepository.create.mock.calls[0];
    expect(storedHash).not.toBe('password123');
    expect(await bcrypt.compare('password123', storedHash)).toBe(true);
  });

  it('hashes the password, creates the user, and returns a token', async () => {
    usersRepository.findByEmail.mockResolvedValue(null);
    usersRepository.create.mockResolvedValue(
      userFixture({ id: 'u2', email: 'new@nafa.gn', passwordHash: 'hashed' }),
    );

    const result = await registerUser.execute('new@nafa.gn', 'password123');

    expect(usersRepository.create).toHaveBeenCalledWith(
      'new@nafa.gn',
      expect.any(String),
    );
    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: 'u2',
      email: 'new@nafa.gn',
    });
    expect(result).toEqual({ accessToken: 'signed.jwt.token' });
  });
});
