/**
 * The domain representation used by identity use cases.
 * Persistence-specific audit fields deliberately stay outside this contract.
 */
export interface IdentityUser {
  id: string;
  email: string;
  passwordHash: string;
}
