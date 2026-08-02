import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import {
  IDENTITY_USER_REPOSITORY,
  type IdentityUser,
  type IdentityUserRepository,
} from '../../domain';
import { AuthService } from './auth.service';

function userFixture(overrides: Partial<IdentityUser> = {}): IdentityUser {
  return {
    id: 'user-id',
    email: 'user@nafa.gn',
    passwordHash: 'hash',
    ...overrides,
  };
}

describe('AuthService', () => {
  let authService: AuthService;
  let usersRepository: jest.Mocked<IdentityUserRepository>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
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

    authService = moduleRef.get(AuthService);
    usersRepository = moduleRef.get(IDENTITY_USER_REPOSITORY);
    jwtService = moduleRef.get(JwtService);
  });

  it('rejects an email that is already registered', async () => {
    usersRepository.findByEmail.mockResolvedValue(
      userFixture({ id: 'u1', email: 'existing@nafa.gn' }),
    );

    await expect(
      authService.register('existing@nafa.gn', 'password123'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('hashes the password, creates the user, and returns a token', async () => {
    usersRepository.findByEmail.mockResolvedValue(null);
    usersRepository.create.mockResolvedValue(
      userFixture({ id: 'u2', email: 'new@nafa.gn', passwordHash: 'hashed' }),
    );

    const result = await authService.register('new@nafa.gn', 'password123');

    expect(usersRepository.create).toHaveBeenCalledWith(
      'new@nafa.gn',
      expect.any(String),
    );
    const [, storedHash] = usersRepository.create.mock.calls[0];
    expect(await bcrypt.compare('password123', storedHash)).toBe(true);
    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: 'u2',
      email: 'new@nafa.gn',
    });
    expect(result).toEqual({ accessToken: 'signed.jwt.token' });
  });

  it('rejects an unknown email', async () => {
    usersRepository.findByEmail.mockResolvedValue(null);

    await expect(
      authService.login('ghost@nafa.gn', 'password123'),
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
      authService.login('user@nafa.gn', 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns a token for valid credentials', async () => {
    usersRepository.findByEmail.mockResolvedValue(
      userFixture({
        id: 'u4',
        passwordHash: await bcrypt.hash('correct-password', 10),
      }),
    );

    await expect(
      authService.login('user@nafa.gn', 'correct-password'),
    ).resolves.toEqual({ accessToken: 'signed.jwt.token' });
  });
});
