import type { CooperativeMembershipSnapshot } from '@nafa/foundation';

/** The structural subset of a Prisma row the mapper reads. */
export interface MembershipPrismaRow {
  readonly id: string;
  readonly cooperativeId: string;
  readonly memberId: string;
  readonly status: string;
  readonly admittedAt: string;
  readonly endedAt: string | null;
  readonly version: number;
}

/**
 * Maps between the membership snapshot and its row.
 *
 * Flat both sides: the aggregate holds two ActorIds, a status and two dates,
 * and nothing here needs a JSON column. `endedAt` is optional in the domain
 * and nullable in the database — the one place the two shapes differ.
 */
export function membershipToRow(snapshot: CooperativeMembershipSnapshot): {
  id: string;
  cooperativeId: string;
  memberId: string;
  status: string;
  admittedAt: string;
  endedAt: string | null;
  version: number;
} {
  return {
    id: snapshot.id,
    cooperativeId: snapshot.cooperativeId,
    memberId: snapshot.memberId,
    status: snapshot.status,
    admittedAt: snapshot.admittedAt,
    endedAt: snapshot.endedAt ?? null,
    version: snapshot.version,
  };
}

export function membershipToSnapshot(
  row: MembershipPrismaRow,
): CooperativeMembershipSnapshot {
  return {
    id: row.id as CooperativeMembershipSnapshot['id'],
    cooperativeId:
      row.cooperativeId as CooperativeMembershipSnapshot['cooperativeId'],
    memberId: row.memberId as CooperativeMembershipSnapshot['memberId'],
    status: row.status as CooperativeMembershipSnapshot['status'],
    admittedAt: row.admittedAt as CooperativeMembershipSnapshot['admittedAt'],
    endedAt:
      row.endedAt === null
        ? undefined
        : (row.endedAt as CooperativeMembershipSnapshot['admittedAt']),
    version: row.version,
  };
}
