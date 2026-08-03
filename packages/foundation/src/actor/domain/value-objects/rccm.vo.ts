import { type Brand, err, ok, type Result } from '@nafa/shared';
import { ActorRule, ActorRuleViolation } from '../actor.errors';

/**
 * Registre du Commerce et du Crédit Mobilier — the OHADA business register
 * number. Guinea is an OHADA member state, so this is the identifier a company
 * is known by commercially.
 *
 * Format across member states: `<country>-<city>-<year>-<type>-<serial>`,
 * for example `GN-CKY-2024-B-01234`. The parts are validated loosely on
 * purpose: registries differ in how they punctuate and pad, and a strict
 * pattern would reject genuine numbers from a state we have not surveyed.
 * What matters here is that the value is canonical and comparable, because
 * uniqueness across the registry is an invariant.
 */
export type Rccm = Brand<string, 'Rccm'>;

const SHAPE = /^[A-Z]{2}-[A-Z0-9]{2,6}-\d{4}-[A-Z]-\d{1,10}$/;

export function rccm(raw: string): Result<Rccm, ActorRuleViolation> {
  const canonical = raw
    .trim()
    .toUpperCase()
    .replace(/[\s/]+/g, '-');

  if (!SHAPE.test(canonical)) {
    return err(
      ActorRuleViolation.invalid(
        ActorRule.INVALID_RCCM,
        'An RCCM number must look like GN-CKY-2024-B-01234.',
      ),
    );
  }

  return ok(canonical as Rccm);
}
