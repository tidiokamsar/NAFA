import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { PasswordHasher } from '../../application';

/**
 * bcrypt cost factor. Unchanged from the pre-refactor AuthService — raising it
 * would invalidate no stored hash (the cost travels inside the hash), but it
 * is a deliberate latency decision, not an implementation detail to drift.
 */
const PASSWORD_HASH_ROUNDS = 10;

@Injectable()
export class BcryptPasswordHasher implements PasswordHasher {
  hash(plainText: string): Promise<string> {
    return bcrypt.hash(plainText, PASSWORD_HASH_ROUNDS);
  }

  compare(plainText: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainText, hash);
  }
}
