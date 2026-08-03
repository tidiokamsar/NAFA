import type { Actor } from '../actor.aggregate';
import type { ActorId, Nif, PhoneNumber, Rccm } from '../value-objects';

/**
 * How the domain reaches actors.
 *
 * An interface plus a token. Whether the rows live in Postgres, in memory or
 * behind a service call is an adapter decision; naming any of them here would
 * make the port abstract nothing.
 *
 * The lookups by RCCM, NIF and phone number exist for one reason: uniqueness
 * across the registry cannot be checked by an aggregate, which sees only
 * itself. They are the questions ActorUniquenessChecker asks.
 */
export interface ActorRepository {
  findById(id: ActorId): Promise<Actor | null>;

  /** The company or cooperative holding this commercial register number. */
  findByRccm(rccm: Rccm): Promise<Actor | null>;

  /** The actor holding this tax identifier. */
  findByNif(nif: Nif): Promise<Actor | null>;

  /**
   * Every actor reachable on this number.
   *
   * Returns a list, not one actor: sharing a handset is ordinary in NAFA's
   * markets, so a collision is a signal rather than a contradiction.
   */
  findByPhoneNumber(phone: PhoneNumber): Promise<readonly Actor[]>;

  /**
   * Persists the actor, refusing the write if the stored row moved.
   *
   * `expectedVersion` is in the signature rather than read off the aggregate
   * on purpose: an adapter that never sees the parameter is an adapter that
   * silently overwrites concurrent changes, and nothing would fail. Making it
   * an argument means an implementation cannot be written without deciding
   * what to do about it.
   *
   * Callers pass `actor.expectedVersion` — the version the actor was loaded
   * at, not `actor.version`, which has already moved by the time you save.
   * An adapter compares it in its `WHERE` clause and raises
   * its persistence concurrency error when no row matches. Zero means the
   * actor has never been stored, so the write is an insert.
   */
  save(actor: Actor, expectedVersion: number): Promise<void>;
}

/** Framework-neutral injection token, bound by the adapter side. */
export const ACTOR_REPOSITORY = Symbol('ACTOR_REPOSITORY');
