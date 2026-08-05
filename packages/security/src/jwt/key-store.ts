import { Inject, Injectable } from '@nestjs/common';
import { JWT_KEYS, type JwtSigningKey } from './jwt.types';

/**
 * Holds the signing keys and knows which one signs.
 *
 * Rotation works because signing and verification are separated:
 *   1. add a new key with `active: true`;
 *   2. flip the previous key to `active: false` — it keeps verifying the
 *      tokens it already signed;
 *   3. drop it once every token it signed has expired.
 *
 * No step invalidates a token that is still legitimately in flight, so
 * rotation never logs users out. Loading keys from a real secret manager
 * (Vault, Key Vault, Secrets Manager) is a matter of providing a different
 * `JWT_KEYS` value — this class does not care where they came from.
 */
@Injectable()
export class JwtKeyStore {
  private readonly byKid: Map<string, JwtSigningKey>;

  constructor(@Inject(JWT_KEYS) keys: JwtSigningKey[]) {
    if (keys.length === 0) {
      throw new Error('JwtKeyStore requires at least one signing key.');
    }
    const active = keys.filter((key) => key.active);
    if (active.length !== 1) {
      // Two active keys make "which one signed this?" ambiguous; zero makes
      // signing impossible. Both are configuration errors worth failing on.
      throw new Error(
        `Exactly one active signing key is required, found ${active.length}.`,
      );
    }
    this.byKid = new Map(keys.map((key) => [key.kid, key]));
  }

  /** The key new tokens are signed with. */
  get signingKey(): JwtSigningKey {
    const key = [...this.byKid.values()].find((candidate) => candidate.active);
    if (!key) throw new Error('No active signing key.');
    return key;
  }

  /** Looks up the key a token was signed with, active or retired. */
  findByKid(kid: string): JwtSigningKey | undefined {
    return this.byKid.get(kid);
  }

  /** Every key, for exposing a JWKS document. */
  all(): JwtSigningKey[] {
    return [...this.byKid.values()];
  }
}
