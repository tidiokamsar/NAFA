import type { AdministrativeArea } from '../administrative-area.aggregate';
import type { AdministrativeAreaId } from '../administrative-area-id.vo';
import type { AreaCode } from '../area-code.vo';
import type { CountryCode } from '../../../country-profile/domain/country-code.vo';

/**
 * How the domain reaches administrative areas.
 *
 * An interface plus a token. Whether the rows live in Postgres, in memory or
 * behind a service call is an adapter decision; naming any of them here would
 * make the port abstract nothing.
 *
 * The lookups by code and by name exist for one reason: uniqueness of a code
 * and ambiguity of a name span the whole collection, and no single aggregate
 * can see its siblings. They are the questions
 * `AreaCodeUniquenessChecker` and `AreaResolutionService` ask.
 */
export interface AdministrativeAreaRepository {
  findById(id: AdministrativeAreaId): Promise<AdministrativeArea | null>;

  /** The area carrying this code in this country, whatever its status. */
  findByCode(
    countryCode: CountryCode,
    code: AreaCode,
  ): Promise<AdministrativeArea | null>;

  /** Direct children of a parent — one level down, nothing deeper. */
  findChildren(
    parentId: AdministrativeAreaId,
  ): Promise<readonly AdministrativeArea[]>;

  /** The chain from this area up to the root, this area excluded. */
  findAncestors(
    id: AdministrativeAreaId,
  ): Promise<readonly AdministrativeArea[]>;

  /**
   * Every area whose official name or aliases match this text, in this country.
   *
   * Returns a list, never a single area: names repeat across levels and
   * spellings vary, so a match is a signal rather than an answer. This is the
   * question `AreaResolutionService` refines; the repository does not score.
   */
  findByName(
    countryCode: CountryCode,
    name: string,
  ): Promise<readonly AdministrativeArea[]>;

  /**
   * Persists the area, refusing the write if the stored row moved.
   *
   * Same contract as `ActorRepository.save` in `@nafa/foundation`, deliberately:
   * two ports whose write signatures differ would let an adapter author assume
   * one aggregate needs concurrency control and the other does not. Both do —
   * a parent being dissolved while a child is reparented is exactly the race
   * this catches.
   *
   * Callers pass `area.expectedVersion` — the version it was loaded at, not
   * `area.version`, which has already moved by the time you save. An adapter
   * compares it in its `WHERE` clause and raises `StaleVersionError` from
   * `@nafa/shared` when no row matches. Zero means the area has never been
   * stored, so the write is an insert.
   */
  save(area: AdministrativeArea, expectedVersion: number): Promise<void>;
}

/** Framework-neutral injection token, bound by the adapter side. */
export const ADMINISTRATIVE_AREA_REPOSITORY = Symbol(
  'ADMINISTRATIVE_AREA_REPOSITORY',
);
