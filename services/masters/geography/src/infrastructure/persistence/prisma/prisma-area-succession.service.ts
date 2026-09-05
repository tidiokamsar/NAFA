import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '@nafa/shared';
import {
  GeographyRuleViolation,
  type AdministrativeArea,
  type AreaSuccessionService,
} from '@nafa/geography';

/**
 * Adapter for the AreaSuccessionService port.
 *
 * Merge and split move more than one aggregate at once — they succeed or fail
 * together. This service orchestrates the aggregate transitions but **does
 * not persist**: it returns the modified aggregates for the caller (the
 * application layer) to save in a single transaction. The boundary between
 * "decide what changes" and "commit the changes" is what keeps this a domain
 * service rather than a service over a connection.
 *
 * The aggregate methods (`merge`, `split`) are synchronous and pure — they
 * mutate the in-memory aggregate and record domain events. The adapter wraps
 * them in an async signature to honour the port contract, which allows future
 * implementations to add pre-flight checks against the store (e.g. "no active
 * children") before committing to the transition.
 */
@Injectable()
export class PrismaAreaSuccessionService implements AreaSuccessionService {
  async merge(
    sources: readonly AdministrativeArea[],
    successorIds: readonly string[],
  ): Promise<Result<readonly AdministrativeArea[], GeographyRuleViolation>> {
    const modified: AdministrativeArea[] = [];

    for (const source of sources) {
      const result = source.merge(successorIds as never);
      if (!result.ok) return result;
      modified.push(source);
    }

    return ok(modified);
  }

  async split(
    source: AdministrativeArea,
    successorIds: readonly string[],
  ): Promise<Result<AdministrativeArea, GeographyRuleViolation>> {
    const result = source.split(successorIds as never);
    if (!result.ok) {
      return err(result.error);
    }
    return ok(source);
  }
}
