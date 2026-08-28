import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { StaleVersionError, type Clock, type IdGenerator } from '@nafa/shared';
import {
  AdministrativeArea,
  type AdministrativeAreaRepository,
} from '@nafa/geography';
import { PrismaService } from './prisma.service';
import {
  administrativeAreaToRow,
  administrativeAreaToSnapshot,
  type AdministrativeAreaPrismaRow,
} from '../mappers/administrative-area.mapper';

/**
 * Prisma adapter for the AdministrativeAreaRepository port.
 *
 * Same optimistic-concurrency contract as ActorRepository and
 * CountryProfileRepository: `save` compares `expectedVersion` in the WHERE
 * clause and raises `StaleVersionError` when the stored row moved.
 *
 * `findAncestors` walks the parent chain iteratively. The hierarchy is at most
 * four levels deep (LEVEL_1..LEVEL_4 plus COUNTRY), so a recursive CTE would
 * be overkill — a bounded loop is clearer and stays within Prisma's query
 * model.
 */
@Injectable()
export class PrismaAdministrativeAreaRepository implements AdministrativeAreaRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async findById(id: string): Promise<AdministrativeArea | null> {
    const row = await this.prisma.administrativeArea.findUnique({
      where: { id, deletedAt: null },
    });
    return row ? this.rehydrate(row) : null;
  }

  async findByCode(
    countryCode: string,
    code: string,
  ): Promise<AdministrativeArea | null> {
    const row = await this.prisma.administrativeArea.findFirst({
      where: { countryCode, code, deletedAt: null },
    });
    return row ? this.rehydrate(row) : null;
  }

  async findChildren(parentId: string): Promise<readonly AdministrativeArea[]> {
    const rows = await this.prisma.administrativeArea.findMany({
      where: { parentId, deletedAt: null },
    });
    return rows.map((r) => this.rehydrate(r));
  }

  async findAncestors(id: string): Promise<readonly AdministrativeArea[]> {
    const ancestors: AdministrativeArea[] = [];

    // Seed the walk with the starting area's parent link, then follow each
    // ancestor's own parentId — one full-row query per level.
    const start: { parentId: string | null } | null =
      await this.prisma.administrativeArea.findFirst({
        where: { id, deletedAt: null },
        select: { parentId: true },
      });
    let parentId: string | null = start?.parentId ?? null;

    // Bounded by the hierarchy depth — at most 5 hops (LEVEL_4 → COUNTRY).
    for (let depth = 0; depth < 6 && parentId !== null; depth++) {
      const parent: AdministrativeAreaPrismaRow | null =
        await this.prisma.administrativeArea.findFirst({
          where: { id: parentId, deletedAt: null },
        });
      if (!parent) break;

      ancestors.push(this.rehydrate(parent));
      parentId = parent.parentId;
    }

    return ancestors;
  }

  async findByName(
    countryCode: string,
    name: string,
  ): Promise<readonly AdministrativeArea[]> {
    // The domain's AreaResolutionService does the precise scoring and ranking.
    // Here we do a broad string match on the JSON column — Postgres searches
    // the serialised text, so it catches both official names and aliases.
    const rows = await this.prisma.administrativeArea.findMany({
      where: {
        countryCode,
        deletedAt: null,
        name: { string_contains: name },
      },
    });
    return rows.map((r) => this.rehydrate(r));
  }

  async save(area: AdministrativeArea, expectedVersion: number): Promise<void> {
    const row = administrativeAreaToRow(area.snapshot());

    if (expectedVersion === 0) {
      await this.prisma.administrativeArea.create({
        data: {
          id: row.id,
          countryCode: row.countryCode,
          level: row.level as never,
          code: row.code,
          name: row.name,
          parentId: row.parentId,
          centroid: row.centroid ?? Prisma.JsonNull,
          validFrom: row.validFrom,
          validTo: row.validTo,
          status: row.status as never,
          successors: row.successors,
          version: 1,
        },
      });
      return;
    }

    const result = await this.prisma.administrativeArea.updateMany({
      where: { id: row.id, version: expectedVersion, deletedAt: null },
      data: {
        level: row.level as never,
        code: row.code,
        name: row.name,
        parentId: row.parentId,
        centroid: row.centroid ?? Prisma.JsonNull,
        validFrom: row.validFrom,
        validTo: row.validTo,
        status: row.status as never,
        successors: row.successors,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new StaleVersionError(
        'AdministrativeArea',
        expectedVersion,
        area.version,
      );
    }
  }

  private rehydrate(row: AdministrativeAreaPrismaRow): AdministrativeArea {
    return AdministrativeArea.rehydrate(administrativeAreaToSnapshot(row), {
      clock: this.clock,
      ids: this.ids,
    });
  }
}
