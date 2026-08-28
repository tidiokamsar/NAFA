import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '@nafa/shared';
import {
  GeographyRule,
  GeographyRuleViolation,
  type AreaCodeUniquenessChecker,
} from '@nafa/geography';
import { PrismaService } from './prisma.service';

/**
 * Prisma adapter for the AreaCodeUniquenessChecker port.
 *
 * Uniqueness of a code spans the whole collection — no single aggregate can
 * see its siblings — so the check is asked of the store. This is the reason
 * invariant 13 (AreaCode unique per country+level) lives outside the
 * AdministrativeArea aggregate.
 *
 * A check, not a lock: two concurrent registrations can both pass and both
 * write. The composite unique index on [countryCode, level, code] is what
 * finally decides — the adapter turns the common case into a clear business
 * refusal instead of a constraint violation surfacing three layers up.
 */
@Injectable()
export class PrismaAreaCodeUniquenessChecker implements AreaCodeUniquenessChecker {
  constructor(private readonly prisma: PrismaService) {}

  async check(
    countryCode: string,
    level: string,
    code: string,
    excluding?: string,
  ): Promise<Result<void, GeographyRuleViolation>> {
    const existing = await this.prisma.administrativeArea.findFirst({
      where: {
        countryCode,
        level: level as never,
        code,
        deletedAt: null,
        ...(excluding ? { NOT: { id: excluding } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      return err(
        GeographyRuleViolation.violated(
          GeographyRule.AREA_CODE_NOT_UNIQUE,
          `Code "${code}" is already in use at ${level} in country ${countryCode}.`,
        ),
      );
    }

    return ok(undefined);
  }
}
