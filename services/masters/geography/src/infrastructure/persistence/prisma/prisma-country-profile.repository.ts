import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { StaleVersionError, type Clock, type IdGenerator } from '@nafa/shared';
import { CountryProfile, type CountryProfileRepository } from '@nafa/geography';
import { PrismaService } from './prisma.service';
import {
  countryProfileToRow,
  countryProfileToSnapshot,
} from '../mappers/country-profile.mapper';

/**
 * Prisma adapter for the CountryProfileRepository port.
 *
 * The aggregate is identified by `countryCode` (the natural key), not by the
 * surrogate `id` UUID — the domain never sees the id. Reads reconstruct the
 * aggregate via `rehydrate`; writes use optimistic concurrency on the
 * `version` column, the same contract as ActorRepository in @nafa/foundation.
 */
@Injectable()
export class PrismaCountryProfileRepository implements CountryProfileRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async findByCountry(countryCode: string): Promise<CountryProfile | null> {
    const row = await this.prisma.countryProfile.findUnique({
      where: { countryCode, deletedAt: null },
    });
    if (!row) return null;
    return this.rehydrate(row);
  }

  async listPublished(): Promise<readonly CountryProfile[]> {
    const rows = await this.prisma.countryProfile.findMany({
      where: { status: 'PUBLISHED', deletedAt: null },
    });
    return rows.map((r) => this.rehydrate(r));
  }

  async save(profile: CountryProfile, expectedVersion: number): Promise<void> {
    const data = countryProfileToRow(profile.snapshot());

    if (expectedVersion === 0) {
      // Insert — the aggregate has never been stored.
      await this.prisma.countryProfile.create({
        data: {
          countryCode: data.countryCode,
          status: data.status as never,
          levels: data.levels as unknown as Prisma.InputJsonValue,
          version: 1,
        },
      });
      return;
    }

    // Optimistic update — refuse if the stored row moved.
    const result = await this.prisma.countryProfile.updateMany({
      where: {
        countryCode: data.countryCode,
        version: expectedVersion,
        deletedAt: null,
      },
      data: {
        status: data.status as never,
        levels: data.levels as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new StaleVersionError(
        'CountryProfile',
        expectedVersion,
        profile.version,
      );
    }
  }

  private rehydrate(row: {
    id: string;
    countryCode: string;
    status: string;
    levels: unknown;
    version: number;
  }): CountryProfile {
    return CountryProfile.rehydrate(
      countryProfileToSnapshot({
        id: row.id,
        countryCode: row.countryCode,
        status: row.status as 'DRAFT' | 'PUBLISHED' | 'DEPRECATED',
        levels: row.levels,
        version: row.version,
      }),
      { clock: this.clock, ids: this.ids },
    );
  }
}
