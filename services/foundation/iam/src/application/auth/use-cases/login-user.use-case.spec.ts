import type { IdentityUser, IdentityUserRepository } from '../../../domain';
import { InvalidCredentialsError } from '../auth.errors';
import type { AccessTokenIssuer } from '../ports/access-token-issuer.port';
import type { PasswordHasher } from '../ports/password-hasher.port';
import { LoginUserUseCase } from './login-user.use-case';

function userFixture(overrides: Partial<IdentityUser> = {}): IdentityUser {
  return {
    id: 'user-id',
    email: 'user@nafa.gn',
    passwordHash: 'stored-hash',
    ...overrides,
  };
}

describe('LoginUserUseCase', () => {
  let loginUser: LoginUserUseCase;
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
      hash: jest.fn(),
      compare: jest.fn(),
    };
    tokens = {
      issueFor: jest.fn().mockReturnValue({ accessToken: 'signed.jwt.token' }),
    };

    loginUser = new LoginUserUseCase(usersRepository, passwords, tokens);
  });

  it('rejects an unknown email', async () => {
    usersRepository.findByEmail.mockResolvedValue(null);

    await expect(
      loginUser.execute('ghost@nafa.gn', 'password123'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('rejects an incorrect password', async () => {
    usersRepository.findByEmail.mockResolvedValue(userFixture({ id: 'u3' }));
    passwords.compare.mockResolvedValue(false);

    await expect(
      loginUser.execute('user@nafa.gn', 'wrong-password'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(tokens.issueFor).not.toHaveBeenCalled();
  });

  it('does not let an unknown email be told apart from a wrong password', async () => {
    usersRepository.findByEmail.mockResolvedValue(null);
    const unknownEmail = await loginUser
      .execute('ghost@nafa.gn', 'password123')
      .catch((error: unknown) => error);

    usersRepository.findByEmail.mockResolvedValue(userFixture());
    passwords.compare.mockResolvedValue(false);
    const wrongPassword = await loginUser
      .execute('user@nafa.gn', 'wrong-password')
      .catch((error: unknown) => error);

    expect(unknownEmail).toBeInstanceOf(InvalidCredentialsError);
    expect(wrongPassword).toBeInstanceOf(InvalidCredentialsError);
    // Same type and same wording, so the API layer cannot render them
    // differently even by accident.
    expect((unknownEmail as Error).message).toBe(
      (wrongPassword as Error).message,
    );
    expect((unknownEmail as Error).message).toBe('Invalid credentials');
  });

  it('checks the candidate password against the stored hash', async () => {
    const stored = userFixture({ id: 'u4', passwordHash: 'stored-hash' });
    usersRepository.findByEmail.mockResolvedValue(stored);
    passwords.compare.mockResolvedValue(true);

    await loginUser.execute('user@nafa.gn', 'correct-password');

    expect(passwords.compare).toHaveBeenCalledWith(
      'correct-password',
      'stored-hash',
    );
  });

  it('returns a token for valid credentials', async () => {
    const stored = userFixture({ id: 'u4' });
    usersRepository.findByEmail.mockResolvedValue(stored);
    passwords.compare.mockResolvedValue(true);

    await expect(
      loginUser.execute('user@nafa.gn', 'correct-password'),
    ).resolves.toEqual({ accessToken: 'signed.jwt.token' });
    expect(tokens.issueFor).toHaveBeenCalledWith(stored);
  });
});
