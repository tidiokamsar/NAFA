import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

/** OWASP baseline for Argon2id (19 MiB, 2 iterations, parallelism 1). */
const PARAMS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Encoded argon2 hashes look like:
 *   `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<digest>`
 * This pulls out the variant and the three cost parameters.
 */
const HASH_PATTERN = /^\$(argon2(?:id|i|d))\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/;

/**
 * Password hashing with Argon2id.
 *
 * Argon2id over bcrypt: it is memory-hard, so an attacker with GPUs or ASICs
 * gains far less than against bcrypt, and it won the Password Hashing
 * Competition. `@node-rs/argon2` ships prebuilt binaries, so there is no
 * node-gyp step and Alpine images need no build toolchain.
 *
 * Cost parameters are embedded in the hash string, so raising them later does
 * not invalidate existing hashes — {@link needsUpgrade} spots the old ones.
 */
@Injectable()
export class HashingService {
  /** Hashes a password. The salt is generated internally, never supplied. */
  hash(password: string): Promise<string> {
    return hash(password, PARAMS);
  }

  /**
   * Verifies a password against a stored hash.
   *
   * Returns false rather than throwing on a malformed hash, so a corrupted
   * record is indistinguishable from a wrong password to the caller.
   */
  async verify(hashed: string, password: string): Promise<boolean> {
    try {
      return await verify(hashed, password, PARAMS);
    } catch {
      return false;
    }
  }

  /**
   * True when `hashed` was produced with a weaker variant or lower cost than
   * the current parameters.
   *
   * Re-hash on the next successful login — the only moment the plaintext
   * password is available. An unparseable hash returns true so it gets
   * replaced rather than kept forever.
   *
   * Implemented here because `@node-rs/argon2` exposes no `needsRehash`.
   */
  needsUpgrade(hashed: string): boolean {
    const match = HASH_PATTERN.exec(hashed);
    if (!match) return true;

    const [, variant, memory, time, parallelism] = match;
    if (variant !== 'argon2id') return true;

    return (
      Number(memory) < PARAMS.memoryCost ||
      Number(time) < PARAMS.timeCost ||
      Number(parallelism) < PARAMS.parallelism
    );
  }
}
