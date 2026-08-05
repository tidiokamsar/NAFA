import * as bcrypt from 'bcryptjs';
import { BcryptPasswordHasher } from './bcrypt-password.hasher';

/**
 * The use-case specs drive a double, so this is where the real algorithm is
 * exercised — including the cost factor, which is a behaviour the refactor had
 * to carry over unchanged.
 */
describe('BcryptPasswordHasher', () => {
  const hasher = new BcryptPasswordHasher();

  it('produces a hash the plaintext cannot be read out of', async () => {
    const hash = await hasher.hash('password123');

    expect(hash).not.toBe('password123');
    expect(hash).not.toContain('password123');
  });

  it('keeps the cost factor at 10', async () => {
    // bcrypt records the cost inside the hash: $2<variant>$<cost>$<salt+digest>.
    // Asserting it here is what stops a silent change to how expensive — and
    // therefore how brute-forceable — every stored password is.
    const hash = await hasher.hash('password123');

    expect(hash).toMatch(/^\$2[aby]\$10\$/);
  });

  it('salts, so the same password never hashes twice the same way', async () => {
    const [first, second] = await Promise.all([
      hasher.hash('password123'),
      hasher.hash('password123'),
    ]);

    expect(first).not.toBe(second);
  });

  it('accepts the correct password and rejects a wrong one', async () => {
    const hash = await hasher.hash('correct-password');

    await expect(hasher.compare('correct-password', hash)).resolves.toBe(true);
    await expect(hasher.compare('wrong-password', hash)).resolves.toBe(false);
  });

  it('still verifies hashes produced outside this adapter', async () => {
    // Stored hashes predate this class; swapping the implementation in must
    // not lock existing users out.
    const legacyHash = await bcrypt.hash('password123', 10);

    await expect(hasher.compare('password123', legacyHash)).resolves.toBe(true);
  });
});
