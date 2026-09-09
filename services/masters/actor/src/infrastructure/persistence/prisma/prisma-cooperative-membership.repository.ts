import { Injectable } from '@nestjs/common';
// `Clock` and `IdGenerator` are imported as VALUES, not types. They are
// abstract classes used as DI tokens, and a `type` import is erased at
// compile time — `emitDecoratorMetadata` then records `Function` instead of
// the class, and Nest has no token to resolve. The service still typechecks,
// still builds, and fails only when something actually boots the module.
// Nothing did until the first HTTP e2e (ADR-0014 §4).
import { Clock, IdGenerator, StaleVersionError } from '@nafa/shared';
import { appendToOutbox } from '@nafa/platform';
import {
  CooperativeMembership,
  MembershipStatus,
  type ActorId,
  type CooperativeMembershipId,
  type CooperativeMembershipRepository,
} from '@nafa/foundation';
import { PrismaService } from './prisma.service';
import {
  membershipToRow,
  membershipToSnapshot,
  type MembershipPrismaRow,
} from '../mappers/cooperative-membership.mapper';

/**
 * Prisma adapter for the CooperativeMembershipRepository port.
 *
 * Flat rows, same optimistic-concurrency contract as every repository before
 * it. The two actor references are plain UUIDs with no foreign key: a
 * membership holds ActorIds, never Actors, which is what lets the two
 * aggregates load and version independently (ADR-0006).
 *
 * `findActiveBetween` is the one query with a rule inside it. At most one
 * ACTIVE membership may exist per (cooperative, member) pair, and Postgres
 * cannot express that as a unique index because the condition is partial.
 * The invariant therefore lives in the domain, and this method is how it
 * asks — which is why it filters on ACTIVE rather than returning whatever
 * the pair has ever had.
 */
@Injectable()
export class PrismaCooperativeMembershipRepository implements CooperativeMembershipRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async findById(
    id: CooperativeMembershipId,
  ): Promise<CooperativeMembership | null> {
    const row = await this.prisma.cooperativeMembership.findFirst({
      where: { id: id as string, deletedAt: null },
    });
    return row ? this.rehydrate(row) : null;
  }

  async findActiveBetween(
    cooperativeId: ActorId,
    memberId: ActorId,
  ): Promise<CooperativeMembership | null> {
    const row = await this.prisma.cooperativeMembership.findFirst({
      where: {
        cooperativeId: cooperativeId as string,
        memberId: memberId as string,
        status: MembershipStatus.ACTIVE as never,
        deletedAt: null,
      },
    });
    return row ? this.rehydrate(row) : null;
  }

  async listByCooperative(
    cooperativeId: ActorId,
  ): Promise<readonly CooperativeMembership[]> {
    const rows = await this.prisma.cooperativeMembership.findMany({
      where: { cooperativeId: cooperativeId as string, deletedAt: null },
    });
    return rows.map((row) => this.rehydrate(row));
  }

  async listByMember(
    memberId: ActorId,
  ): Promise<readonly CooperativeMembership[]> {
    const rows = await this.prisma.cooperativeMembership.findMany({
      where: { memberId: memberId as string, deletedAt: null },
    });
    return rows.map((row) => this.rehydrate(row));
  }

  async save(
    membership: CooperativeMembership,
    expectedVersion: number,
  ): Promise<void> {
    const row = membershipToRow(membership.snapshot());
    // Drained before the transaction opens, and once. `pullEvents()`
    // empties the buffer, so draining inside a callback that could run
    // twice would lose the second half of the events.
    //
    // The consequence, which ADR-0018 chose to document rather than prevent:
    // if the transaction below fails, these events are already gone from the
    // aggregate while its row was never written. Nothing is lost silently —
    // the caller gets the exception — but this instance must not be saved
    // again. A retry on it would write the row with no events at all. Reload
    // the aggregate instead.
    const events = membership.pullEvents();

    // The row and its events in one transaction (ADR-0008). A
    // successful write followed by a failed publication loses the
    // event; the reverse order announces a write that never landed.
    await this.prisma.$transaction(async (tx) => {
      if (expectedVersion === 0) {
        await tx.cooperativeMembership.create({
          data: {
            id: row.id,
            cooperativeId: row.cooperativeId,
            memberId: row.memberId,
            status: row.status as never,
            admittedAt: row.admittedAt,
            endedAt: row.endedAt,
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
        // Only the status and its end date move after admission. The pair and
        // the admission date are what the membership *is* — changing either
        // would make it a different membership, not an updated one.
        const result = await tx.cooperativeMembership.updateMany({
          where: { id: row.id, version: expectedVersion, deletedAt: null },
          data: {
            status: row.status as never,
            endedAt: row.endedAt,
            // The aggregate's own count. See PrismaActorRepository.save.
            version: row.version,
          },
        });

        if (result.count === 0) {
          throw new StaleVersionError(
            'CooperativeMembership',
            expectedVersion,
            membership.version,
          );
        }
      }

      await appendToOutbox(tx, events);
    });
  }

  private rehydrate(row: MembershipPrismaRow): CooperativeMembership {
    return CooperativeMembership.rehydrate(membershipToSnapshot(row), {
      clock: this.clock,
      ids: this.ids,
    });
  }
}
