import { Injectable } from '@nestjs/common';
import { StaleVersionError, type Clock, type IdGenerator } from '@nafa/shared';
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

    if (expectedVersion === 0) {
      await this.prisma.cooperativeMembership.create({
        data: {
          id: row.id,
          cooperativeId: row.cooperativeId,
          memberId: row.memberId,
          status: row.status as never,
          admittedAt: row.admittedAt,
          endedAt: row.endedAt,
          version: 1,
        },
      });
      return;
    }

    // Only the status and its end date move after admission. The pair and
    // the admission date are what the membership *is* — changing either
    // would make it a different membership, not an updated one.
    const result = await this.prisma.cooperativeMembership.updateMany({
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

  private rehydrate(row: MembershipPrismaRow): CooperativeMembership {
    return CooperativeMembership.rehydrate(membershipToSnapshot(row), {
      clock: this.clock,
      ids: this.ids,
    });
  }
}
