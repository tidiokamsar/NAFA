import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import type { User } from '../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

/** Builds a full User row so tests stay valid as audit columns evolve. */
function userFixture(overrides: Partial<User> = {}): User {
  return {
    id: 'user-id',
    email: 'user@nafa.gn',
    passwordHash: 'hash',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    version: 1,
    ...overrides,
  };
}

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
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
    usersService = moduleRef.get(UsersService);
    jwtService = moduleRef.get(JwtService);
  });

  describe('register', () => {
    it('rejects an email that is already registered', async () => {
      usersService.findByEmail.mockResolvedValue(
        userFixture({ id: 'u1', email: 'existing@nafa.gn' }),
      );

      await expect(
        authService.register('existing@nafa.gn', 'password123'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('hashes the password, creates the user, and returns a token', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(
        userFixture({ id: 'u2', email: 'new@nafa.gn', passwordHash: 'hashed' }),
      );

      const result = await authService.register('new@nafa.gn', 'password123');

      expect(usersService.create).toHaveBeenCalledWith(
        'new@nafa.gn',
        expect.any(String),
      );
      const [, storedHash] = usersService.create.mock.calls[0];
      expect(await bcrypt.compare('password123', storedHash)).toBe(true);
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'u2',
        email: 'new@nafa.gn',
      });
      expect(result).toEqual({ accessToken: 'signed.jwt.token' });
    });
  });

  describe('login', () => {
    it('rejects an unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login('ghost@nafa.gn', 'password123'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an incorrect password', async () => {
      usersService.findByEmail.mockResolvedValue(
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
      usersService.findByEmail.mockResolvedValue(
        userFixture({
          id: 'u4',
          passwordHash: await bcrypt.hash('correct-password', 10),
        }),
      );

      const result = await authService.login(
        'user@nafa.gn',
        'correct-password',
      );

      expect(result).toEqual({ accessToken: 'signed.jwt.token' });
    });
  });
});
