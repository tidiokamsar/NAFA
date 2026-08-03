import { type Brand, err, ok, type Result } from '@nafa/shared';
import { ActorRule, ActorRuleViolation } from '../actor.errors';

/**
 * Numéro d'Identification Fiscale — the tax identifier.
 *
 * Held by companies and cooperatives, and by natural persons who register as
 * traders. Unique across the registry, which is why it is normalised here:
 * two spellings of the same NIF must collide, or the uniqueness check is
 * decorative.
 */
export type Nif = Brand<string, 'Nif'>;

const SHAPE = /^[0-9]{9,15}$/;

export function nif(raw: string): Result<Nif, ActorRuleViolation> {
  const canonical = raw.trim().replace(/[\s.-]/g, '');

  if (!SHAPE.test(canonical)) {
    return err(
      ActorRuleViolation.invalid(
        ActorRule.INVALID_NIF,
        'A NIF must be 9 to 15 digits.',
      ),
    );
  }

  return ok(canonical as Nif);
}
