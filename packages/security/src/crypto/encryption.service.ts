import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32; // 256 bits
const IV_BYTES = 12; // 96 bits — the size GCM is specified for
const TAG_BYTES = 16;

/**
 * Symmetric encryption for data at rest (tokens, PII, third-party
 * credentials).
 *
 * AES-256-**GCM**, not CBC: GCM authenticates as well as encrypts, so
 * tampering is detected at decryption instead of silently producing garbage
 * that downstream code then trusts.
 *
 * Output layout, base64-encoded: `iv (12) || tag (16) || ciphertext`. A fresh
 * random IV per call is mandatory — reusing one under the same key breaks GCM
 * catastrophically, which is why the IV is never a parameter.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  /**
   * @param key 32-byte key, base64 or hex encoded. Generate one with
   *   `openssl rand -base64 32` and store it in a secret manager.
   */
  constructor(key: string) {
    const decoded = EncryptionService.decodeKey(key);
    if (decoded.length !== KEY_BYTES) {
      throw new Error(
        `Encryption key must be ${KEY_BYTES} bytes, got ${decoded.length}.`,
      );
    }
    this.key = decoded;
  }

  /** Encrypts a UTF-8 string. Returns base64 `iv || tag || ciphertext`. */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
      'base64',
    );
  }

  /**
   * Reverses {@link encrypt}.
   * @throws when the payload is malformed or the authentication tag fails —
   *   both mean the ciphertext cannot be trusted.
   */
  decrypt(payload: string): string {
    const raw = Buffer.from(payload, 'base64');
    // Exactly IV + tag is valid: it is the encryption of an empty string.
    if (raw.length < IV_BYTES + TAG_BYTES) {
      throw new Error('Ciphertext is too short to be valid.');
    }

    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Constant-time comparison, for secrets that are compared rather than hashed. */
  static safeEquals(a: string, b: string): boolean {
    const bufferA = Buffer.from(a, 'utf8');
    const bufferB = Buffer.from(b, 'utf8');
    // timingSafeEqual throws on length mismatch, which would itself leak the
    // length; compare lengths first and return a constant-time false.
    if (bufferA.length !== bufferB.length) return false;
    return timingSafeEqual(bufferA, bufferB);
  }

  /** Generates a fresh base64 key suitable for the constructor. */
  static generateKey(): string {
    return randomBytes(KEY_BYTES).toString('base64');
  }

  private static decodeKey(key: string): Buffer {
    const isHex = /^[0-9a-fA-F]+$/.test(key) && key.length === KEY_BYTES * 2;
    return Buffer.from(key, isHex ? 'hex' : 'base64');
  }
}
