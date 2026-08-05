import { type Brand, err, ok, type Result } from '@nafa/shared';
import { ActorRule, ActorRuleViolation } from '../actor.errors';

/**
 * Nominal so an ActorId cannot be passed where another id is expected. Every
 * aggregate outside this context references actors by this type — never by a
 * bare string, and never by holding an Actor object.
 */
export type ActorId = Brand<string, 'ActorId'>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function actorId(raw: string): Result<ActorId, ActorRuleViolation> {
  if (!UUID.test(raw)) {
    return err(
      ActorRuleViolation.invalid(
        ActorRule.INVALID_ACTOR_ID,
        'An actor id must be a UUID.',
      ),
    );
  }
  // Lowercased so two spellings of the same id compare equal.
  return ok(raw.toLowerCase() as ActorId);
}
