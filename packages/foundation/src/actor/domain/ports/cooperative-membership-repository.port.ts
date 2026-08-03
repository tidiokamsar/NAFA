import type { CooperativeMembership } from '../membership';
import type { CooperativeMembershipId } from '../membership';
import type { ActorId } from '../value-objects';

/**
 * How the domain reaches cooperative memberships.
 *
 * An interface plus a token, and nothing else. Whether the rows live in
 * Postgres, in memory or behind a service call is an adapter decision; a port
 * that mentioned any of them would abstract nothing.
 *
 * `findActiveBetween` exists because uniqueness of an active membership spans
 * the whole collection: no single aggregate can see its siblings, so the check
 * has to be asked of the store. It is the reason invariant "no member twice"
 * lives in the domain service rather than in the aggregate.
 */
export interface CooperativeMembershipRepository {
  findById(id: CooperativeMembershipId): Promise<CooperativeMembership | null>;

  /** The current membership of this member in this cooperative, if any. */
  findActiveBetween(
    cooperativeId: ActorId,
    memberId: ActorId,
  ): Promise<CooperativeMembership | null>;

  /** Every membership of a cooperative, ended ones included. */
  listByCooperative(
    cooperativeId: ActorId,
  ): Promise<readonly CooperativeMembership[]>;

  /** Every cooperative a member belongs to or belonged to. */
  listByMember(memberId: ActorId): Promise<readonly CooperativeMembership[]>;

  /**
   * Persists the membership, refusing the write if the stored row moved.
   *
   * Same contract as `ActorRepository.save`, deliberately: two ports whose
   * write signatures differ would let an adapter author assume one aggregate
   * needs concurrency control and the other does not. Both do — a member
   * resigning while an administrator excludes them is exactly the race this
   * catches.
   *
   * Callers pass `membership.expectedVersion` — the version it was loaded at,
   * not `membership.version`, which has already moved by the time you save. An
   * adapter compares it in its `WHERE` clause and raises `StaleVersionError`
   * from `@nafa/shared` when no row matches. Zero means the membership has
   * never been stored, so the write is an insert.
   */
  save(
    membership: CooperativeMembership,
    expectedVersion: number,
  ): Promise<void>;
}

/** Framework-neutral injection token, bound by the adapter side. */
export const COOPERATIVE_MEMBERSHIP_REPOSITORY = Symbol(
  'COOPERATIVE_MEMBERSHIP_REPOSITORY',
);
