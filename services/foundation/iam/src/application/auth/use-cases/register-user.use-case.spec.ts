import type { IdentityUser, IdentityUserRepository } from '../../../domain';
import { EmailAlreadyRegisteredError } from '../auth.errors';
import type { AccessTokenIssuer } from '../ports/access-token-issuer.port';
import type { PasswordHasher } from '../ports/password-hasher.port';
import { RegisterUserUseCase } from './register-user.use-case';

// No Test.createTestingModule, and nothing imported from @nestjs or bcryptjs:
// the use case is a plain class, so plain objects are good enough doubles.
// That this file needs no container is the decoupling, demonstrated.

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
  let passwords: jest.Mocked<PasswordHasher>;
  let tokens: jest.Mocked<AccessTokenIssuer>;

  beforeEach(() => {
    usersRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };
    passwords = {
      hash: jest.fn().mockResolvedValue('hashed-password'),
      compare: jest.fn(),
    };
    tokens = {
      issueFor: jest.fn().mockReturnValue({ accessToken: 'signed.jwt.token' }),
    };

    registerUser = new RegisterUserUseCase(usersRepository, passwords, tokens);
  });

  it('rejects an email that is already registered', async () => {
    usersRepository.findByEmail.mockResolvedValue(
      userFixture({ id: 'u1', email: 'existing@nafa.gn' }),
    );

    await expect(
      registerUser.execute('existing@nafa.gn', 'password123'),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    expect(usersRepository.create).not.toHaveBeenCalled();
  });

  it('keeps the wording the API layer turns into a 409', () => {
    // The message is public: it reaches the client through the error envelope.
    expect(new EmailAlreadyRegisteredError().message).toBe(
      'Email already registered',
    );
  });

  it('never lets the plaintext password reach the repository', async () => {
    usersRepository.findByEmail.mockResolvedValue(null);
    usersRepository.create.mockResolvedValue(
      userFixture({ id: 'u2', email: 'new@nafa.gn' }),
    );

    await registerUser.execute('new@nafa.gn', 'password123');

    expect(passwords.hash).toHaveBeenCalledWith('password123');
    const [, storedHash] = usersRepository.create.mock.calls[0];
    expect(storedHash).toBe('hashed-password');
    expect(storedHash).not.toBe('password123');
  });

  it('hashes the password, creates the user, and returns a token', async () => {
    usersRepository.findByEmail.mockResolvedValue(null);
    const created = userFixture({ id: 'u2', email: 'new@nafa.gn' });
    usersRepository.create.mockResolvedValue(created);

    const result = await registerUser.execute('new@nafa.gn', 'password123');

    expect(usersRepository.create).toHaveBeenCalledWith(
      'new@nafa.gn',
      'hashed-password',
    );
    // The token is minted for the persisted user, not the request payload:
    // only the former carries the generated id.
    expect(tokens.issueFor).toHaveBeenCalledWith(created);
    expect(result).toEqual({ accessToken: 'signed.jwt.token' });
  });
});
