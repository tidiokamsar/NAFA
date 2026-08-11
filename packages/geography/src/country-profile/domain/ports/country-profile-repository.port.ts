import type { CountryProfile } from '../country-profile.aggregate';
import type { CountryCode } from '../country-code.vo';

/**
 * How the domain reaches country profiles.
 *
 * An interface plus a token. Whether the rows live in Postgres, in memory or
 * behind a service call is an adapter decision; naming any of them here would
 * make the port abstract nothing.
 */
export interface CountryProfileRepository {
  /** The profile for this country, whatever its status. */
  findByCountry(code: CountryCode): Promise<CountryProfile | null>;

  /** Every profile ready to host administrative areas. */
  listPublished(): Promise<readonly CountryProfile[]>;

  /**
   * Persists the profile, refusing the write if the stored row moved.
   *
   * Same contract as `ActorRepository.save` in `@nafa/foundation`, deliberately:
   * two ports whose write signatures differ would let an adapter author assume
   * one aggregate needs concurrency control and the other does not. Both do.
   *
   * Callers pass `profile.expectedVersion` — the version it was loaded at, not
   * `profile.version`, which has already moved by the time you save. An adapter
   * compares it in its `WHERE` clause and raises `StaleVersionError` from
   * `@nafa/shared` when no row matches. Zero means the profile has never been
   * stored, so the write is an insert.
   */
  save(profile: CountryProfile, expectedVersion: number): Promise<void>;
}

/** Framework-neutral injection token, bound by the adapter side. */
export const COUNTRY_PROFILE_REPOSITORY = Symbol('COUNTRY_PROFILE_REPOSITORY');
