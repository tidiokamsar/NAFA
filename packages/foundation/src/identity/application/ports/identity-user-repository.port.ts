import type { IdentityUser } from '../../domain/identity-user';

export interface IdentityUserRepository {
  findByEmail(email: string): Promise<IdentityUser | null>;
  findById(id: string): Promise<IdentityUser | null>;
  create(email: string, passwordHash: string): Promise<IdentityUser>;
}

/** Dependency-injection token kept framework-neutral for adapters to bind. */
export const IDENTITY_USER_REPOSITORY = Symbol('IDENTITY_USER_REPOSITORY');
