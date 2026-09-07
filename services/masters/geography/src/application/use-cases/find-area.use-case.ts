import { ErrorCode, NafaError } from '@nafa/shared';
import type {
  AdministrativeArea,
  AdministrativeAreaId,
  AdministrativeAreaRepository,
  AreaCode,
  CountryCode,
  CountryProfile,
  CountryProfileRepository,
} from '@nafa/geography';

/**
 * Raised when a lookup by key finds nothing.
 *
 * A `NafaError` rather than a NestJS exception: the application layer holds
 * no framework, and the global filter already turns `NOT_FOUND` into a 404
 * with the code echoed (ADR-0014 §2).
 */
export class GeographyNotFoundError extends NafaError {
  constructor(what: string, by: string, value: string) {
    super(ErrorCode.NOT_FOUND, `No ${what} with ${by} "${value}".`);
  }
}

/**
 * Reads of the administrative-area hierarchy.
 *
 * A plain class: no decorators, everything through the constructor. The
 * composition root in `api/` turns it into a provider.
 */
export class FindAreaUseCase {
  constructor(private readonly areas: AdministrativeAreaRepository) {}

  async byId(id: string): Promise<AdministrativeArea> {
    const area = await this.areas.findById(id as AdministrativeAreaId);
    if (!area) throw new GeographyNotFoundError('area', 'id', id);
    return area;
  }

  /** The natural key: a code is unique per country and level (invariant 13). */
  async byCode(country: string, code: string): Promise<AdministrativeArea> {
    const area = await this.areas.findByCode(
      country as CountryCode,
      code as AreaCode,
    );
    if (!area) throw new GeographyNotFoundError('area', 'code', code);
    return area;
  }

  /**
   * The direct children, one level down. Not the whole subtree: an unbounded
   * descent is a decision this API has not taken.
   */
  async children(id: string): Promise<readonly AdministrativeArea[]> {
    // Resolve the parent first, so a missing id is a 404 rather than an
    // empty list that reads like "this area has no children".
    await this.byId(id);
    return this.areas.findChildren(id as AdministrativeAreaId);
  }

  /** The chain upward, excluding the area itself. */
  async ancestors(id: string): Promise<readonly AdministrativeArea[]> {
    await this.byId(id);
    return this.areas.findAncestors(id as AdministrativeAreaId);
  }

  /** Search by official name or alias. An empty list is a legitimate answer. */
  byName(
    country: string,
    name: string,
  ): Promise<readonly AdministrativeArea[]> {
    return this.areas.findByName(country as CountryCode, name);
  }
}

/** Reads of the country templates. */
export class FindCountryUseCase {
  constructor(private readonly profiles: CountryProfileRepository) {}

  async byCode(code: string): Promise<CountryProfile> {
    const profile = await this.profiles.findByCountry(code as CountryCode);
    if (!profile) throw new GeographyNotFoundError('country', 'code', code);
    return profile;
  }

  /**
   * Only PUBLISHED profiles.
   *
   * A DRAFT country is a template still being written: exposing it would
   * invite a client to build against levels that may still change.
   */
  listPublished(): Promise<readonly CountryProfile[]> {
    return this.profiles.listPublished();
  }
}
