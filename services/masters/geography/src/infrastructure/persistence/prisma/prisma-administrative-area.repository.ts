import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
// `Clock` and `IdGenerator` are imported as VALUES, not types. They are
// abstract classes used as DI tokens, and a `type` import is erased at
// compile time — `emitDecoratorMetadata` then records `Function` instead of
// the class, and Nest has no token to resolve. The service still typechecks,
// still builds, and fails only when something actually boots the module.
// Nothing did until the first HTTP e2e (ADR-0014 §4).
import { Clock, IdGenerator, StaleVersionError } from '@nafa/shared';
import { appendToOutbox } from '@nafa/platform';
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
    //
    // Raw SQL rather than a Prisma JSON filter: `string_contains` on a Json
    // column only matches when the column holds a top-level string, not the
    // { official, aliases } object we store — verified by the e2e suite.
    // ILIKE keeps it case-insensitive so "kindya" finds the alias "Kindya".
    // The mapper's structural row type describes exactly what comes back:
    // pg parses jsonb columns into objects, and quoted camelCase columns
    // keep their names.
    const rows = await this.prisma.$queryRaw<AdministrativeAreaPrismaRow[]>(
      Prisma.sql`
        SELECT * FROM administrative_areas
        WHERE "countryCode" = ${countryCode}
          AND "deletedAt" IS NULL
          AND "name"::text ILIKE ${'%' + name + '%'}
      `,
    );
    return rows.map((r) => this.rehydrate(r));
  }

  async save(area: AdministrativeArea, expectedVersion: number): Promise<void> {
    const row = administrativeAreaToRow(area.snapshot());
    // Drained before the transaction opens, and once. `pullEvents()`
    // empties the buffer, so draining inside a callback that could run
    // twice would lose the second half of the events.
    const events = area.pullEvents();

    // The row and its events in one transaction (ADR-0008). A
    // successful write followed by a failed publication loses the
    // event; the reverse order announces a write that never landed.
    await this.prisma.$transaction(async (tx) => {
      if (expectedVersion === 0) {
        await tx.administrativeArea.create({
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
            // The aggregate's own count here too, not a hardcoded 1. A
            // factory that emits two events — create then publish — leaves
            // the aggregate at 2, and storing 1 would make the next load
            // hand back a version the domain never produced. The outbox's
            // unique index on (aggregate, aggregateId, version) is what
            // exposed this: the second save collided with the row the first
            // had already written for that version (ADR-0012 §3).
            version: row.version,
          },
        });
      } else {
        const result = await tx.administrativeArea.updateMany({
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
            // The aggregate's own count, not `increment: 1`. An aggregate can
            // apply several mutations before a single save, and its version moves
            // once per event: incrementing by one would store fewer than the
            // aggregate counts, and the next load would hand a use case a version
            // the domain never produced. The concurrency guard is unchanged — it
            // is the WHERE clause above (ADR-0012 §3).
            version: row.version,
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

      await appendToOutbox(tx, events);
    });
  }

  private rehydrate(row: AdministrativeAreaPrismaRow): AdministrativeArea {
    return AdministrativeArea.rehydrate(administrativeAreaToSnapshot(row), {
      clock: this.clock,
      ids: this.ids,
    });
  }
}
