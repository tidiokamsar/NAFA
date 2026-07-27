import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

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
      usersService.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'existing@nafa.gn',
        passwordHash: 'hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        authService.register('existing@nafa.gn', 'password123'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('hashes the password, creates the user, and returns a token', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({
        id: 'u2',
        email: 'new@nafa.gn',
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

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
      usersService.findByEmail.mockResolvedValue({
        id: 'u3',
        email: 'user@nafa.gn',
        passwordHash: await bcrypt.hash('correct-password', 10),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        authService.login('user@nafa.gn', 'wrong-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns a token for valid credentials', async () => {
      usersService.findByEmail.mockResolvedValue({
        id: 'u4',
        email: 'user@nafa.gn',
        passwordHash: await bcrypt.hash('correct-password', 10),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await authService.login(
        'user@nafa.gn',
        'correct-password',
      );

      expect(result).toEqual({ accessToken: 'signed.jwt.token' });
    });
  });
});
