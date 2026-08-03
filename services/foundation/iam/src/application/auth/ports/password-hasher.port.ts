/**
 * How the application layer turns a plaintext password into something safe to
 * store, and checks one against a stored hash.
 *
 * The algorithm and its cost factor are deliberately absent from this
 * contract: they are an infrastructure decision that gets revisited as
 * hardware gets faster, and a use case that named bcrypt would have to be
 * edited to change it.
 */
export interface PasswordHasher {
  hash(plainText: string): Promise<string>;
  compare(plainText: string, hash: string): Promise<boolean>;
}

/** Framework-neutral injection token, bound by the adapter side. */
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
