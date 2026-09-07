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
    // Drained before the transaction opens, and once. `pullEvents()`
    // empties the buffer, so draining inside a callback that could run
    // twice would lose the second half of the events.
    const events = profile.pullEvents();

    // The row and its events in one transaction (ADR-0008). A
    // successful write followed by a failed publication loses the
    // event; the reverse order announces a write that never landed.
    await this.prisma.$transaction(async (tx) => {
      if (expectedVersion === 0) {
        // Insert — the aggregate has never been stored.
        await tx.countryProfile.create({
          data: {
            countryCode: data.countryCode,
            status: data.status as never,
            levels: data.levels as unknown as Prisma.InputJsonValue,
            // The aggregate's own count here too, not a hardcoded 1. A
            // factory that emits two events — create then publish — leaves
            // the aggregate at 2, and storing 1 would make the next load
            // hand back a version the domain never produced. The outbox's
            // unique index on (aggregate, aggregateId, version) is what
            // exposed this: the second save collided with the row the first
            // had already written for that version (ADR-0012 §3).
            version: data.version,
          },
        });
      } else {
        // Optimistic update — refuse if the stored row moved.
        const result = await tx.countryProfile.updateMany({
          where: {
            countryCode: data.countryCode,
            version: expectedVersion,
            deletedAt: null,
          },
          data: {
            status: data.status as never,
            levels: data.levels as unknown as Prisma.InputJsonValue,
            // The aggregate's own count, not `increment: 1`. An aggregate can
            // apply several mutations before a single save, and its version moves
            // once per event: incrementing by one would store fewer than the
            // aggregate counts, and the next load would hand a use case a version
            // the domain never produced. The concurrency guard is unchanged — it
            // is the WHERE clause above (ADR-0012 §3).
            version: data.version,
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

      await appendToOutbox(tx, events);
    });
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
