import { HashingService } from './hashing.service';

describe('HashingService', () => {
  const hashing = new HashingService();

  it('verifies a correct password', async () => {
    const hashed = await hashing.hash('correct horse battery staple');
    await expect(
      hashing.verify(hashed, 'correct horse battery staple'),
    ).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hashed = await hashing.hash('correct horse battery staple');
    await expect(hashing.verify(hashed, 'wrong password')).resolves.toBe(false);
  });

  // Argon2 salts internally; identical hashes would mean the salt is fixed.
  it('produces a different hash for the same password', async () => {
    const a = await hashing.hash('same password');
    const b = await hashing.hash('same password');
    expect(a).not.toBe(b);
  });

  it('emits an argon2id hash', async () => {
    expect(await hashing.hash('whatever')).toMatch(/^\$argon2id\$/);
  });

  it('returns false rather than throwing on a malformed hash', async () => {
    await expect(hashing.verify('not-a-hash', 'password')).resolves.toBe(false);
  });

  it('does not ask to upgrade a freshly created hash', async () => {
    const hashed = await hashing.hash('password');
    expect(hashing.needsUpgrade(hashed)).toBe(false);
  });

  it('asks to upgrade an unparseable hash', () => {
    expect(hashing.needsUpgrade('not-a-hash')).toBe(true);
  });
});
