import { err, ok, type Result } from '@nafa/shared';
import type { ActorRepository } from '../ports/actor-repository.port';
import { ActorRule, ActorRuleViolation } from '../actor.errors';
import { ActorNature, type LegalIdentity } from '../identity';
import {
  ContactChannel,
  type ActorId,
  type ContactPoint,
  type PhoneNumber,
} from '../value-objects';

/**
 * The rules that no aggregate can enforce alone.
 *
 * An actor sees only itself, so "this RCCM belongs to nobody else" is a
 * question about the whole registry and has to be asked of the store. That is
 * what makes this a domain service over a port rather than a method on Actor.
 *
 * It is a check, not a lock. Two registrations racing can both pass and both
 * write; the database unique index is what finally decides. Checking here
 * turns the common case into a clear business refusal instead of a constraint
 * violation surfacing three layers up.
 */
export class ActorUniquenessChecker {
  constructor(private readonly actors: ActorRepository) {}

  /**
   * Refuses an identity whose registry number is already taken.
   *
   * @param excluding the actor being updated, so it does not collide with
   *   itself — omit when registering a new one.
   */
  async checkIdentity(
    identity: LegalIdentity,
    excluding?: ActorId,
  ): Promise<Result<void, ActorRuleViolation>> {
    const rccm =
      identity.nature === ActorNature.COMPANY ? identity.rccm : undefined;

    if (rccm) {
      const holder = await this.actors.findByRccm(rccm);
      if (holder && holder.id !== excluding) {
        return err(
          ActorRuleViolation.violated(
            ActorRule.RCCM_ALREADY_REGISTERED,
            `The commercial register number ${rccm} is already registered.`,
          ),
        );
      }
    }

    if (identity.nif) {
      const holder = await this.actors.findByNif(identity.nif);
      if (holder && holder.id !== excluding) {
        return err(
          ActorRuleViolation.violated(
            ActorRule.NIF_ALREADY_REGISTERED,
            `The tax identifier ${identity.nif} is already registered.`,
          ),
        );
      }
    }

    return ok(undefined);
  }

  /**
   * Actors already reachable on the same numbers.
   *
   * Deliberately **not** a refusal, and this is a judgement call worth being
   * explicit about. Sharing a handset is ordinary in NAFA's markets: a
   * producer registers on a relative's phone, a cooperative agent enrols
   * twenty members from one line. A hard uniqueness rule would make those
   * people unregisterable, which is a worse failure than a duplicate.
   *
   * So the collision is reported and the caller decides — flag for review,
   * warn the agent, or ignore. The information is available; the policy is
   * not baked into the domain.
   */
  async findPhoneNumberCollisions(
    contacts: readonly ContactPoint[],
    excluding?: ActorId,
  ): Promise<ReadonlyMap<PhoneNumber, readonly ActorId[]>> {
    const collisions = new Map<PhoneNumber, readonly ActorId[]>();

    for (const contact of contacts) {
      if (contact.channel !== ContactChannel.PHONE) {
        continue;
      }

      const holders = await this.actors.findByPhoneNumber(contact.value);
      const others = holders
        .filter((actor) => actor.id !== excluding)
        .map((actor) => actor.id);

      if (others.length > 0) {
        collisions.set(contact.value, others);
      }
    }

    return collisions;
  }
}
