import type { Result } from '@nafa/shared';
import type { GeographyRuleViolation } from '../../../country-profile/domain/country-profile.errors';
import type { AdministrativeArea } from '../administrative-area.aggregate';
import type { AdministrativeAreaId } from '../administrative-area-id.vo';

/**
 * Merge and split, the operations that move more than one aggregate at once.
 *
 * These succeed or fail together: marking three areas as merged into a fourth
 * leaves the registry inconsistent if only two of the three writes land. The
 * operation therefore needs a unit of work that the domain layer cannot
 * provide on its own — an aggregate transaction is out of scope for
 * `AdministrativeArea`, which sees only itself.
 *
 * The contract returns the aggregates the caller must then persist in a single
 * transaction. It does not persist itself: the boundary between "decide what
 * changes" and "commit the changes" is what keeps this a port rather than a
 * service over a connection.
 */
export interface AreaSuccessionService {
  /**
   * Marks each source as merged into `successors`.
   *
   * Each source transitions to MERGED with `successorIds` recorded. The
   * successors themselves are not created here — the caller creates them
   * through `AdministrativeAreaFactory` and passes their ids. This keeps the
   * port free of creation dependencies.
   *
   * @returns the modified sources, for the caller to persist in one transaction.
   */
  merge(
    sources: readonly AdministrativeArea[],
    successorIds: readonly AdministrativeAreaId[],
  ): Promise<Result<readonly AdministrativeArea[], GeographyRuleViolation>>;

  /**
   * Marks the source as split into `successors`.
   *
   * The source transitions to SPLIT with `successorIds` recorded. At least two
   * successors are required (enforced by the aggregate). The successors
   * themselves are not created here.
   *
   * @returns the modified source, for the caller to persist.
   */
  split(
    source: AdministrativeArea,
    successorIds: readonly AdministrativeAreaId[],
  ): Promise<Result<AdministrativeArea, GeographyRuleViolation>>;
}

/** Framework-neutral injection token, bound by the adapter side. */
export const AREA_SUCCESSION_SERVICE = Symbol('AREA_SUCCESSION_SERVICE');
