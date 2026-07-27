import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-SHA256 signatures for payload integrity.
 *
 * Used for outgoing webhooks and for verifying incoming ones from partners
 * (payment providers, customs systems) — anywhere both sides share a secret
 * and a message must be proven unmodified.
 */
@Injectable()
export class HmacService {
  /** Hex-encoded HMAC-SHA256 of `payload`. */
  sign(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  }

  /**
   * Verifies a signature in constant time.
   *
   * A plain `===` would return early on the first differing character, letting
   * an attacker recover the signature byte by byte from response timings.
   */
  verify(payload: string, signature: string, secret: string): boolean {
    const expected = Buffer.from(this.sign(payload, secret), 'utf8');
    const received = Buffer.from(signature, 'utf8');
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
  }
}
